import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Readable} from 'node:stream';
import {createHash} from 'node:crypto';
const h=vi.hoisted(()=>({
  started:null,consumed:false,accountLinks:[],codeConsumeCount:0,rotations:0,
  verifiedSub:'pilot-subject',linker:'principal-A',session:null,bindCalls:0,bindFailure:null,googleFailure:null,legacyPilot:false,freshConsent:false,lastIdentity:null,
  linkedAccounts:[],disconnects:[],providerRevokeTokens:[],providerRevokeError:false
}));
vi.mock('../../src/db.js',()=>({
 initSchema:async()=>{},getOAuthClient:async id=>id==='registered-client'?{
   client_id:id,client_secret:'registered-secret',redirect_uris:['https://chat.example.test/cb']
 }:null,
 getAccessToken:async()=>null,consumeAuthCode:async()=>null,createAccessToken:async()=>null,
 getTokenByRefreshToken:async()=>null
}));
vi.mock('../../src/principals/store.js',()=>({
 createTransaction:async input=>{h.started=input;h.consumed=false;return true;},
 consumeTransaction:async({state,browser,purpose})=>{
   if(h.consumed||!h.started||h.started.state!==state||h.started.browser!==browser||h.started.purpose!==purpose)return null;
   h.consumed=true;
   return {...h.started,nonce_hash:createHash('sha256').update(h.started.nonce).digest('hex'),
     principal_id:h.started.principalId,policy:h.started.policy,verifier:h.started.verifier,
     client_id:h.started.clientId,redirect_uri:h.started.redirectUri,resource:h.started.resource,code_challenge:h.started.codeChallenge};
 },
 bindVerifiedIdentity:async identity=>{h.bindCalls++;h.lastIdentity=identity;if(h.bindFailure)throw Error(h.bindFailure);return '33333333-3333-4333-8333-333333333333';},
 createSession:async()=>({secret:'p10s_'+'a'.repeat(43),csrf:'p10x_'+'b'.repeat(43)}),
 readSession:async secret=>secret==='p10s_'+'a'.repeat(43)?{
   principal_id:'33333333-3333-4333-8333-333333333333',
   csrf_hash:createHash('sha256').update('p10x_'+'b'.repeat(43)).digest('hex'),kind:'user'}:null,
 revokeSession:async()=>1,
 upsertLinkedAccount:async params=>{h.accountLinks.push(params);return 'account-a';},
 listAccounts:async()=>h.linkedAccounts,listConnections:async()=>[],isLegacyPilotIdentityPrincipal:async()=>h.legacyPilot,
 canLegacyPilotStartFreshConsent:async()=>h.freshConsent,
 deletionPreview:async()=>({previewOnly:true}),
 disconnectAccount:async(id,account)=>{h.disconnects.push({id,account});return h.linkedAccounts.some(a=>a.id===account)?1:0;},
 getLinkedGrant:async(id,account)=>h.linkedAccounts.some(a=>a.id===account)?{refresh_token:'user-owned-google-refresh'}:null,
 revokeConnection:async()=>0,setPrincipalDefault:async()=>null,
 requestDeletion:async()=>({pending:true}),cancelDeletion:async()=>({cancelled:true}),
 issuePrincipalCode:async()=> 'p10c_'+'c'.repeat(43),
 consumePrincipalCode:async({code,verifier})=>{h.codeConsumeCount++;return code==='p10c_'+'c'.repeat(43)&&verifier==='valid-verifier'
   ?{principal_id:'33333333-3333-4333-8333-333333333333',account_id:'44444444-4444-4444-8444-444444444444',profile:'read_only',listing:'compact',areas:null,mode:'live',
     client_id:'registered-client',resource:'https://mcp.example.test/api/mcp',cost_policy:{mode:'per_action'}}:null;},
 issuePrincipalConnection:async()=>({accessToken:'p10a_test',refreshToken:'p10r_test'}),
 rotatePrincipalRefresh:async token=>{h.rotations++;return token==='p10r_test'?{accessToken:'p10a_new',refreshToken:'p10r_new'}:null;}
}));
vi.mock('../../src/principals/delegation.js',()=>({
 listCustomerDelegations:async()=>[],
 configureCustomerDelegation:async()=>({configured:true}),
 revokeCustomerDelegation:async()=>({revoked:true}),
 addVerifiedDelegationSubject:async()=>({verified:true}),
 removeDelegationSubject:async()=>({removed:true})
}));
vi.mock('../../src/principals/google.js',()=>({
 PUBLIC_SCOPE_GROUPS:{mail:['scope-mail'],complete:['scope-mail','scope-chat','scope-admin']},
 publicGoogleClient:()=>({revokeToken:async token=>{h.providerRevokeTokens.push(token);if(h.providerRevokeError)throw Error('no token details');}}),
 providerUrl:({state})=>'https://accounts.google.com/o/oauth2?state='+state,
 verifyGoogleCode:async({nonceHash})=>{if(h.googleFailure)throw Error(h.googleFailure);return {issuer:'https://accounts.google.com',sub:h.verifiedSub,
   email:'user@example.test',scopeList:['scope-mail'],
   tokens:{access_token:'google-access',id_token:'validated-google-jwt',refresh_token:'google-refresh'}};}
}));
const {default:start}=await import('../../api/auth/google/start.js');
const {default:callback}=await import('../../api/auth/google/callback.js');
const {default:token}=await import('../../api/oauth/token.js');
const {default:account}=await import('../../api/account.js');
const {default:logout}=await import('../../api/auth/logout.js');
const {default:session}=await import('../../api/auth/session.js');
function res(){
 const x={statusCode:200,headers:{},body:null,ended:false};
 x.setHeader=(key,v)=>{x.headers[key]=v;};
 x.getHeader=key=>x.headers[key];
 x.status=n=>{x.statusCode=n;return x;};
 x.json=v=>{x.body=v;return x;};
 x.send=v=>{x.body=v;return x;};
 x.writeHead=(n,o={})=>{x.statusCode=n;Object.assign(x.headers,o);};
 x.end=()=>{x.ended=true;return x;};
 return x;
}
const req=(method='GET',query={},cookie='',body={})=>({method,query,body,headers:{cookie}});
const sessCookie='p10_session=p10s_'+'a'.repeat(43)+'; p10_csrf=p10x_'+'b'.repeat(43);
const csrf='p10x_'+'b'.repeat(43);
let env;
beforeEach(()=>{
 env={...process.env};
 process.env.PUBLIC_BASE_URL='https://mcp.example.test';
 process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID='public-only-google-app';
 process.env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET='public-only-secret';
 process.env.TOKEN_ENCRYPTION_KEY='x'.repeat(44);
 process.env.PUBLIC_SIGNIN_MODE='pilot';
 process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='pilot-subject';
 h.started=null;h.accountLinks=[];h.bindCalls=0;h.consumed=false;h.rotations=0;h.codeConsumeCount=0;
 h.verifiedSub='pilot-subject';h.bindFailure=null;h.googleFailure=null;h.legacyPilot=false;h.freshConsent=false;h.lastIdentity=null;
 h.linkedAccounts=[];h.disconnects=[];h.providerRevokeTokens=[];h.providerRevokeError=false;
});
afterEach(()=>{process.env=env;});
describe('P10 actual route one-use browser callback and independent principal MCP issuance',()=>{
 it('public flag OFF prevents new sign-in before creating state/provider calls',async()=>{
  process.env.PUBLIC_SIGNIN_MODE='off';
  const out=res();await start(req(),out);
  expect(out.statusCode).toBe(503);expect(h.started).toBeNull();
 });
 it('one browser-bound verified pilot login creates a session; replay and foreign cookie do not',async()=>{
  const started=res();await start(req(),started);
  expect(started.statusCode).toBe(302);
  const state=h.started.state,browser=h.started.browser;
  const wrong=res();await callback(req('GET',{state,code:'google-code'},'p10_google_browser=foreign'),wrong);
  expect(wrong.statusCode).toBe(400);expect(h.bindCalls).toBe(0);
  const good=res();await callback(req('GET',{state,code:'google-code'},'p10_google_browser='+browser),good);
  expect(good.statusCode).toBe(302);expect(h.bindCalls).toBe(1);
  expect(String(good.headers.Location)).toBe('/api/account');
  expect(h.lastIdentity.identityOnlyPilot).toBe(true);
  expect(JSON.stringify(good.headers['Set-Cookie'])).toContain('p10_session');
  const repeated=res();await callback(req('GET',{state,code:'google-code'},'p10_google_browser='+browser),repeated);
  expect(repeated.statusCode).toBe(400);expect(h.bindCalls).toBe(1);
 });
 it('pilot subject is enforced AFTER Google verification, not by request email or hostname',async()=>{
  const started=res();await start(req(),started);
  h.verifiedSub='not-enrolled';
  const out=res();await callback(req('GET',{state:h.started.state,code:'google'},'p10_google_browser='+h.started.browser),out);
  expect(out.statusCode).toBe(400);expect(h.bindCalls).toBe(0);
 });
 it('callback diagnostics classify admission and reserved-owner failures without identities',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{
   const first=res();await start(req(),first);
   h.verifiedSub='unlisted-test-subject';
   const rejected=res();await callback(req('GET',{state:h.started.state,code:'google-secret-code'},
     'p10_google_browser='+h.started.browser),rejected);
   expect(rejected.statusCode).toBe(400);
   expect(warn).toHaveBeenLastCalledWith('p10_google_callback_denied',
     {phase:'pilot_admission',code:'public_signin_not_admitted'});
   expect(h.bindCalls).toBe(0);

   const second=res();await start(req(),second);
   h.verifiedSub='pilot-subject';h.bindFailure='reserved_identity';
   const reserved=res();await callback(req('GET',{state:h.started.state,code:'google-secret-code'},
     'p10_google_browser='+h.started.browser),reserved);
   expect(reserved.statusCode).toBe(400);
   expect(warn).toHaveBeenLastCalledWith('p10_google_callback_denied',
     {phase:'principal_bind',code:'reserved_identity'});
   expect(JSON.stringify(warn.mock.calls)).not.toMatch(/unlisted-test-subject|user@example.test|google-secret-code/);
  }finally{warn.mockRestore();}
 });
 it('callback never logs raw provider or persistence exceptions',async()=>{
  const warn=vi.spyOn(console,'warn').mockImplementation(()=>{});
  try{
   const first=res();await start(req(),first);
   h.googleFailure='provider secret token and user@example.test';
   const out=res();await callback(req('GET',{state:h.started.state,code:'private-code'},
     'p10_google_browser='+h.started.browser),out);
   expect(out.statusCode).toBe(400);
   expect(warn).toHaveBeenLastCalledWith('p10_google_callback_denied',
     {phase:'provider_verification',code:'unclassified'});

   const second=res();await start(req(),second);
   h.googleFailure=null;h.bindFailure='secret db user@example.test';
   const denied=res();await callback(req('GET',{state:h.started.state,code:'private-code'},
     'p10_google_browser='+h.started.browser),denied);
   expect(denied.statusCode).toBe(400);
   expect(warn).toHaveBeenLastCalledWith('p10_google_callback_denied',
     {phase:'principal_bind',code:'unclassified'});
   expect(JSON.stringify(warn.mock.calls)).not.toMatch(/secret|user@example.test|private-code/);
  }finally{warn.mockRestore();}
 });
 it('refuses identity-only legacy tester Google scope consent before generating OAuth state',async()=>{
  h.legacyPilot=true;
  const out=res();
  await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',csrf}),out);
  expect(out.statusCode).toBe(400);
  expect(out.body).toEqual({error:'invalid_authorization_start'});
  expect(h.started).toBeNull();
  expect(h.accountLinks).toHaveLength(0);
 });
 it('does not offer fresh consent merely because a DIFFERENT pilot subject is globally allowed',async()=>{
   h.legacyPilot=true;h.freshConsent=false;
   const otherSubject='123456789012345678901';
   process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321012345678901,'+otherSubject;
   process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=otherSubject;
   process.env.PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED='true';
   const portal=res();await account(req('GET',{},sessCookie),portal);
   expect(portal.statusCode).toBe(200);
   expect(portal.body).toContain('Identity-only legacy tester');
   expect(portal.body).not.toContain('Link Google mail permissions');
   const blocked=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',csrf}),blocked);
   expect(blocked.statusCode).toBe(400);expect(h.started).toBeNull();
 });
 it('fresh legacy tester scope consent requires independent opt-in, CSRF, one-use browser-bound Google flow',async()=>{
   h.legacyPilot=true;h.freshConsent=true;
   const historical='123456789012345678901';
   process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321012345678901,'+historical;
   process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=historical;
   process.env.PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED='true';
   const portal=res();await account(req('GET',{},sessCookie),portal);
   expect(portal.statusCode).toBe(200);
   expect(portal.body).toContain('independently consent');
   const bad=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail'}),bad);
   expect(bad.statusCode).toBe(400);expect(h.started).toBeNull();
   const begin=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',csrf}),begin);
   expect(begin.statusCode).toBe(302);
   const foreign=res();await callback(req('GET',{state:h.started.state,code:'google-code'},
     'p10_google_browser=foreign; '+sessCookie),foreign);
   expect(foreign.statusCode).toBe(400);expect(h.accountLinks).toHaveLength(0);
   const accepted=res();await callback(req('GET',{state:h.started.state,code:'google-code'},
     'p10_google_browser='+h.started.browser+'; '+sessCookie),accepted);
   expect(accepted.statusCode).toBe(302);expect(h.accountLinks).toHaveLength(1);
   const replay=res();await callback(req('GET',{state:h.started.state,code:'google-code'},
     'p10_google_browser='+h.started.browser+'; '+sessCookie),replay);
   expect(replay.statusCode).toBe(400);expect(h.accountLinks).toHaveLength(1);
 });
 it('pilot preselects God mode and public onboarding keeps it optional and off by default',async()=>{
   const pilot=res();await account(req('GET',{},sessCookie),pilot);
   expect(pilot.statusCode).toBe(200);
   expect(pilot.body).toContain('Approved pilot: comprehensive Google acceptance setup');
   expect(pilot.body).toContain('name="godMode" value="true" checked');
   const all=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',godMode:'true',csrf}),all);
   expect(all.statusCode).toBe(302);expect(h.started.policy.group).toBe('complete');
   const ordinary=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',csrf}),ordinary);
   expect(ordinary.statusCode).toBe(302);expect(h.started.policy.group).toBe('mail');

   process.env.PUBLIC_SIGNIN_MODE='public';
   const publicPage=res();await account(req('GET',{},sessCookie),publicPage);
   expect(publicPage.statusCode).toBe(200);
   expect(publicPage.body).toContain('Authorize Google permissions as needed');
   expect(publicPage.body).toContain('name="godMode" value="true"');
   expect(publicPage.body).not.toContain('name="godMode" value="true" checked');
   const optional=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',godMode:'true',csrf}),optional);
   expect(optional.statusCode).toBe(302);expect(h.started.policy.group).toBe('complete');
 });
 it('turning God mode off requires own account + separate checkbox confirmation and immediately disables local client access',async()=>{
   h.linkedAccounts=[{id:'44444444-4444-4444-8444-444444444444',email:'pilot@example.test',
     scope_list:['scope-mail','scope-chat','scope-admin'],is_default:true}];
   const page=res();await account(req('GET',{},sessCookie),page);
   expect(page.body).toContain('Turn off God mode');
   expect(page.body).toContain('God mode active locally');
   const noConfirm=res();await account(req('POST',{},sessCookie,{action:'disable_god_mode',id:h.linkedAccounts[0].id,csrf}),noConfirm);
   expect(noConfirm.statusCode).toBe(403);
   expect(h.disconnects).toEqual([]);expect(h.providerRevokeTokens).toEqual([]);
   const foreign=res();await account(req('POST',{},sessCookie,{action:'disable_god_mode',
     id:'55555555-5555-4555-8555-555555555555',confirm:'true',csrf}),foreign);
   expect(foreign.statusCode).toBe(403);expect(h.disconnects).toEqual([]);
   const good=res();await account(req('POST',{},sessCookie,{action:'disable_god_mode',id:h.linkedAccounts[0].id,confirm:'true',csrf}),good);
   expect(good.statusCode).toBe(200);
   expect(good.body).toMatchObject({godMode:false,disconnected:1,agentConnectionsRevoked:true,providerRevoked:true});
   expect(h.providerRevokeTokens).toEqual(['user-owned-google-refresh']);
   expect(h.disconnects).toHaveLength(1);
 });
 it('provider revocation failure never leaves an active local God-mode agent connection or claims Google success',async()=>{
   h.linkedAccounts=[{id:'44444444-4444-4444-8444-444444444444',
     scope_list:['scope-mail','scope-chat','scope-admin'],email:'pilot@example.test',is_default:false}];
   h.providerRevokeError=true;
   const out=res();await account(req('POST',{},sessCookie,{action:'disable_god_mode',
     id:h.linkedAccounts[0].id,confirm:'true',csrf}),out);
   expect(out.statusCode).toBe(200);
   expect(out.body).toMatchObject({godMode:false,disconnected:1,agentConnectionsRevoked:true,providerRevoked:false});
   expect(out.body.note).toContain('could not be confirmed');
   expect(JSON.stringify(out.body)).not.toContain('user-owned-google-refresh');
   expect(h.disconnects).toHaveLength(1);
 });
 it('comprehensive user consent stays CSRF-bound, scoped and requires Google to approve every selected permission',async()=>{
  const portal=res();await account(req('GET',{},sessCookie),portal);
  expect(portal.statusCode).toBe(200);
  expect(portal.body).toContain('God mode — request all supported Google permissions together');
  expect(portal.body).toContain('name="godMode" value="true" checked');
  const withoutCsrf=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',godMode:'true'}),withoutCsrf);
  expect(withoutCsrf.statusCode).toBe(400);expect(h.started).toBeNull();
  const okStart=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',godMode:'true',csrf}),okStart);
  expect(okStart.statusCode).toBe(302);expect(h.started.policy.group).toBe('complete');
  const wrongBrowser=res();await callback(req('GET',{state:h.started.state,code:'provider-code'},
    'p10_google_browser=foreign; '+sessCookie),wrongBrowser);
  expect(wrongBrowser.statusCode).toBe(400);expect(h.accountLinks).toHaveLength(0);
  const declined=res();await callback(req('GET',{state:h.started.state,code:'provider-code'},
    'p10_google_browser='+h.started.browser+'; '+sessCookie),declined);
  // Google mock grants only scope-mail; the two additional requested scopes
  // are missing, so the application must not pretend comprehensive consent passed.
  expect(declined.statusCode).toBe(400);expect(h.accountLinks).toHaveLength(0);
  const unknown=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'unknown',csrf}),unknown);
  expect(unknown.statusCode).toBe(400);expect(h.accountLinks).toHaveLength(0);
 });
 it('link requires same-origin CSRF and bound session and cannot claim owner global mailboxes',async()=>{
  const missing=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail'}),missing);
  expect(missing.statusCode).toBe(400);expect(h.started).toBeNull();
  const begin=res();await start(req('POST',{},sessCookie,{purpose:'link',group:'mail',csrf}),begin);
  expect(begin.statusCode).toBe(302);
  const done=res();await callback(req('GET',{state:h.started.state,code:'google'},'p10_google_browser='+h.started.browser+'; '+sessCookie),done);
  expect(done.statusCode).toBe(302);
  expect(h.accountLinks).toHaveLength(1);
  expect(h.accountLinks[0]).toMatchObject({principalId:'33333333-3333-4333-8333-333333333333',scopeList:['scope-mail']});
 });
 it('MCP sign-in carries registered resource, S256, client state and redirect across Google',async()=>{
  const begin=res();
  const parameters={purpose:'mcp_authorize',client_id:'registered-client',redirect_uri:'https://chat.example.test/cb',
    code_challenge:'c'.repeat(43),resource:'https://mcp.example.test/api/mcp',state:'original-client-state'};
  await start(req('GET',parameters),begin);expect(begin.statusCode).toBe(302);
  const out=res();
  await callback(req('GET',{state:h.started.state,code:'google'},'p10_google_browser='+h.started.browser),out);
  expect(out.statusCode).toBe(302);
  expect(h.lastIdentity.identityOnlyPilot).toBe(false);
  const u=new URL(out.headers.Location);
  expect(u.pathname).toBe('/api/oauth/authorize');
  expect(u.searchParams.get('state')).toBe('original-client-state');
  expect(u.searchParams.get('code_challenge')).toBe(parameters.code_challenge);
  expect(u.searchParams.get('resource')).toBe(parameters.resource);
 });
 it('exact S256 code and resource permit V2 issue, never forward Google tokens',async()=>{
  const payload={grant_type:'authorization_code',client_id:'registered-client',client_secret:'registered-secret',
    code:'p10c_'+'c'.repeat(43),redirect_uri:'https://chat.example.test/cb',
    resource:'https://mcp.example.test/api/mcp',code_verifier:'valid-verifier'};
  async function call(data){
    const request=Readable.from([new URLSearchParams(data).toString()]);
    request.method='POST';request.headers={'content-type':'application/x-www-form-urlencoded'};
    const response=res();await token(request,response);return response;
  }
  expect((await call({...payload,resource:'https://evil.test/api/mcp'})).statusCode).toBe(400);
  expect((await call({...payload,code_verifier:'wrong'})).statusCode).toBe(400);
  const done=await call(payload);
  expect(done.statusCode).toBe(200);
  expect(done.body).toMatchObject({access_token:'p10a_test',refresh_token:'p10r_test'});
  expect(JSON.stringify(done.body)).not.toContain('google-access');
  expect(h.codeConsumeCount).toBe(2);
  const rotated=await call({grant_type:'refresh_token',client_id:'registered-client',
    client_secret:'registered-secret',refresh_token:'p10r_test',resource:payload.resource});
  expect(rotated.body.access_token).toBe('p10a_new');
  expect(h.rotations).toBe(1);
 });
 it('identity-only legacy tester sees explanation but cannot mutate portal account settings',async()=>{
  h.legacyPilot=true;
  const out=res();await account(req('GET',{},sessCookie),out);
  expect(out.statusCode).toBe(200);
  expect(out.body).toContain('Identity-only legacy tester');
  expect(out.body).not.toContain('Link Google mail permissions');
  const blocked=res();await account(req('POST',{},sessCookie,
    {action:'set_default',id:'foreign',csrf}),blocked);
  expect(blocked).toMatchObject({statusCode:403,body:{error:'legacy_pilot_identity_only'}});
 });
 it('alternate-host Google login redirects to configured HTTPS before cookies, state or provider operations',async()=>{
   const offHost=req('GET',{purpose:'login',ignored:'not-forwarded'},'');
   offHost.headers.host='workspace.example.test';
   offHost.headers['x-forwarded-host']='attacker.example.test';
   const out=res();await start(offHost,out);
   expect(out.statusCode).toBe(303);
   expect(out.headers.Location).toBe('https://mcp.example.test/api/auth/google/start?purpose=login');
   expect(out.headers['Set-Cookie']).toBeUndefined();
   expect(h.started).toBeNull();
   const mcpParams={
     purpose:'mcp_authorize',client_id:'registered-client',
     redirect_uri:'https://chat.example.test/cb',
     resource:'https://mcp.example.test/api/mcp',
     code_challenge:'c'.repeat(43),state:'client-state',danger:'ignored'
   };
   const foreign=req('GET',mcpParams);
   foreign.headers.host='attacker.example.test';
   const redirect=res();await start(foreign,redirect);
   expect(redirect.statusCode).toBe(303);
   const dest=new URL(redirect.headers.Location);
   expect(dest.host).toBe('mcp.example.test');
   for(const [key,value] of Object.entries(mcpParams)){
     if(key==='danger')expect(dest.searchParams.has(key)).toBe(false);
     else expect(dest.searchParams.get(key)).toBe(value);
   }
   expect(h.started).toBeNull();
   const canonical=req('GET',{purpose:'login'});
   canonical.headers.host='mcp.example.test';
   const started=res();await start(canonical,started);
   expect(started.statusCode).toBe(302);
   expect(h.started.purpose).toBe('login');
   expect(started.headers['Set-Cookie']).toContain('p10_google_browser');
 });
 it('alternate-host account portal redirects before inspecting session; canonical anonymous GET guides pilot sign-in',async()=>{
   const foreign=req('GET',{},sessCookie);
   foreign.headers.host='workspace.example.test';
   const redirected=res();await account(foreign,redirected);
   expect(redirected.statusCode).toBe(303);
   expect(redirected.headers.Location).toBe('https://mcp.example.test/api/account');
   expect(redirected.headers['Set-Cookie']).toBeUndefined();
   const canonical=req('GET');
   canonical.headers.host='mcp.example.test';
   const noSession=res();await account(canonical,noSession);
   expect(noSession.statusCode).toBe(401);
   expect(noSession.body).toContain('/api/auth/google/start?purpose=login');
   expect(noSession.body).not.toContain('ops@example.test');
   const ownerStillPrivate=req('GET',{},sessCookie);
   ownerStillPrivate.headers.host='mcp.example.test';
   const accountPage=res();await account(ownerStillPrivate,accountPage);
   expect(accountPage.statusCode).toBe(200);
   expect(accountPage.body).toContain('Workspace MCP by Robinson AI Systems');
 });
 it('invalid operator origin fails closed and alias POST cannot bypass existing CSRF guard',async()=>{
   process.env.PUBLIC_BASE_URL='http://insecure.example.test';
   const login=req('GET',{purpose:'login'});
   login.headers.host='alternate.example.test';
   const rejected=res();await start(login,rejected);
   expect(rejected.statusCode).toBe(400);
   expect(h.started).toBeNull();
   const portal=req('GET');
   portal.headers.host='alternate.example.test';
   const unavailable=res();await account(portal,unavailable);
   expect(unavailable.statusCode).toBe(403);
   expect(unavailable.headers.Location).toBeUndefined();
   process.env.PUBLIC_BASE_URL='https://mcp.example.test';
   const action=req('POST',{},sessCookie,{action:'disconnect_account',id:'foreign'});
   action.headers.host='workspace.example.test';
   const csrfRejected=res();await account(action,csrfRejected);
   expect(csrfRejected.statusCode).toBe(403);
   expect(csrfRejected.headers.Location).toBeUndefined();
 });
 it('logout affects browser only; account listing is owned and requires CSRF for mutations',async()=>{
  const get=res();await session(req('GET',{},sessCookie),get);
  expect(get).toMatchObject({statusCode:200,body:{authenticated:true,linkedAccounts:[]}});
  const unauth=res();await account(req(),unauth);expect(unauth.statusCode).toBe(401);
  expect(unauth.body).toContain('Sign in with your approved Google account');
  const read=res();await account(req('GET',{},sessCookie),read);
  expect(read.statusCode).toBe(200);expect(read.body).toContain('Workspace MCP by Robinson AI Systems');
  expect(read.body).toContain('Not created, operated, sponsored or endorsed by Google LLC.');
  const mutate=res();await account(req('POST',{},sessCookie,{action:'disconnect_account',id:'foreign'}),mutate);
  expect(mutate.statusCode).toBe(403);
  const log=res();await logout(req('POST',{},sessCookie,{csrf}),log);
  expect(log).toMatchObject({statusCode:200,body:{loggedOut:true,agentConnectionsRevoked:false}});
 });
});
