// Owner ruling 2026-11-09 (Workspace is truly public) + D-006 MC-7.0 (no
// cookie on the connect leg). Walks the whole public connect in a browser
// that keeps NO cookies at all, which is how Muse's in-app browser can act:
//   app -> authorize -> Google (asks for everything) -> callback -> Approve
//   page -> "Add another Google account" -> Google -> back to Approve ->
//   Approve -> code back to the app.
// No roster is consulted: the stranger here is not on any list.
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Readable} from 'node:stream';
const P='33333333-3333-4333-8333-333333333333';
const h=vi.hoisted(()=>({txs:new Map(),handles:new Map(),accounts:[],links:[],issued:[],sessionsSet:0,
 nextSub:'stranger-sub-1',nextEmail:'stranger@example.test',scopes:['scope-mail'],linkFailure:null,denial:null,bound:[]}));
vi.mock('../../src/db.js',()=>({initSchema:async()=>{},
 getOAuthClient:async id=>id==='muse'?{client_id:'muse',client_name:'Muse',client_secret:null,
  redirect_uris:['https://agent.meta.ai/api/hatch/oauth/callback']}:null,
 listGoogleAccounts:async()=>{throw Error('owner mailboxes must never be read on the public path');},
 createAuthCode:async()=>{},recordLoginAttempt:async()=>{},countRecentFailedLogins:async()=>0,markLoginAttemptSucceeded:async()=>{}}));
vi.mock('../../src/auth/google-auth-hosted.js',()=>({ensureMigrated:async()=>null}));
vi.mock('../../src/oauth/login-guard.js',()=>({clientIp:()=>'',LOCKOUT_WINDOW_MINUTES:15,evaluateLogin:async()=>({status:'wrong'})}));
vi.mock('../../src/principals/owner-migration.js',async importActual=>({...(await importActual()),
 inspectOwnerLoginProof:async()=>false,consumeOwnerLoginProof:async()=>false,legacyNewLoginEnabled:()=>false}));
vi.mock('../../src/principals/store.js',()=>{
 const spend=(map,key,expect)=>{const row=map.get(key);if(!row||row.used)return null;
  if(expect&&(row.client_id!==expect.clientId||row.redirect_uri!==expect.redirectUri||
   row.resource!==expect.resource||row.code_challenge!==expect.codeChallenge))return null;return row;};
 return {
 createTransaction:async t=>{h.txs.set(t.state,{...t,client_id:t.clientId,redirect_uri:t.redirectUri,resource:t.resource,
  code_challenge:t.codeChallenge,principal_id:t.principalId,nonce_hash:'n',verifier:t.verifier});return true;},
 consumeBrowserTransaction:async()=>null,consumeTransaction:async()=>null,
 consumeCookieFreeTransaction:async({state,purpose})=>{const t=h.txs.get(state);
  if(!t||t.used||t.purpose!==purpose||t.policy?.cookieFree!==true)return null;t.used=true;return t;},
 issueConnectHandle:async r=>{const handle='p10h_'+String(h.handles.size).padStart(43,'k');
  h.handles.set(handle,{principal_id:r.principalId,client_id:r.clientId,redirect_uri:r.redirectUri,resource:r.resource,
   code_challenge:r.codeChallenge,client_state:r.clientState});return handle;},
 readConnectHandle:async(handle,expect)=>spend(h.handles,handle,expect),
 consumeConnectHandle:async(handle,expect)=>{const row=spend(h.handles,handle,expect);if(row)row.used=true;return row;},
 principalSignInEmail:async()=>'stranger@example.test',
 getLatestLinkDenial:async()=>h.denial,
 bindVerifiedIdentity:async x=>{h.bound.push(x);return P;},
 getBoundFullPrincipal:async()=>null,getBoundGraduatingPrincipal:async()=>null,getBoundOwnerPrincipal:async()=>null,
 classifyBoundIdentity:async()=>null,
 upsertLinkedAccount:async x=>{if(h.linkFailure)throw Error(h.linkFailure);h.links.push(x);
  const id='4444444'+h.accounts.length+'-4444-4444-8444-444444444444';h.accounts.push({id,email:x.verifiedEmail,is_default:h.accounts.length===0});return id;},
 recordLinkDenial:async d=>{h.denial=d;},recordSigninDenial:async()=>'d',
 createSession:async()=>{h.sessionsSet++;return {secret:'p10s_'+'s'.repeat(43),csrf:'p10x_'+'x'.repeat(43)};},
 readSession:async()=>null,revokeSession:async()=>0,
 listAccounts:async principal=>principal===P?h.accounts:[],getPrincipal:async()=>null,
 isLegacyPilotIdentityPrincipal:async()=>false,canLegacyPilotStartFreshConsent:async()=>false,
 issuePrincipalCode:async x=>{h.issued.push(x);return 'p10c_'+'c'.repeat(43);}
}});
vi.mock('../../src/principals/google.js',()=>({
 PUBLIC_SCOPE_GROUPS:{mail:['scope-mail'],complete:['scope-mail','scope-drive']},
 IDENTITY_SCOPES:['openid','email','profile'],
 publicGoogleClient:()=>({}),
 providerUrl:({state,group})=>'https://accounts.google.com/o/oauth2?group='+group+'&state='+state,
 verifyGoogleCode:async()=>({issuer:'https://accounts.google.com',sub:h.nextSub,email:h.nextEmail,
  scopeList:h.scopes,tokens:{access_token:'google-access',refresh_token:'google-refresh'}})
}));
const {default:authorize}=await import('../../api/oauth/authorize.js');
const {default:start}=await import('../../api/auth/google/start.js');
const {default:callback}=await import('../../api/auth/google/callback.js');

const BASE='https://workspace.example.test',CB='https://agent.meta.ai/api/hatch/oauth/callback';
const ask={client_id:'muse',redirect_uri:CB,response_type:'code',state:'muse-state',
 code_challenge:'c'.repeat(43),code_challenge_method:'S256',auth_method:'google'};
const res=()=>{const x={statusCode:200,headers:{},body:null};x.setHeader=(k,v)=>{x.headers[k]=v;};x.getHeader=k=>x.headers[k];
 x.status=n=>{x.statusCode=n;return x;};x.send=v=>{x.body=String(v);return x;};x.json=v=>{x.body=v;return x;};
 x.writeHead=(n,o={})=>{x.statusCode=n;Object.assign(x.headers,o);};x.end=()=>x;return x;};
// A browser with NO cookies, ever: the request never carries a Cookie header.
const get=async(handler,query)=>{const out=res();await handler({method:'GET',query,headers:{host:'workspace.example.test'},url:'/'},out);return out;};
const post=async(handler,body,{form=false}={})=>{const out=res();
 const req=form?Readable.from([new URLSearchParams(body).toString()]):{body};
 Object.assign(req,{method:'POST',query:{},url:'/',headers:{host:'workspace.example.test','content-type':'application/x-www-form-urlencoded'},body:form?undefined:body});
 await handler(req,out);return out;};
const hidden=(html,name)=>(html.match(new RegExp('name="'+name+'" value="([^"]*)"'))||[])[1];
const query=u=>Object.fromEntries(new URL(u).searchParams);

let env;
beforeEach(()=>{env={...process.env};process.env.PUBLIC_BASE_URL=BASE;process.env.PUBLIC_SIGNIN_MODE='public';
 delete process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS;
 Object.assign(h,{accounts:[],links:[],issued:[],sessionsSet:0,nextSub:'stranger-sub-1',nextEmail:'stranger@example.test',
  scopes:['scope-mail'],linkFailure:null,denial:null,bound:[]});h.txs.clear();h.handles.clear();});
afterEach(()=>{process.env=env;});

async function signInToApprove(){
 const landing=await get(authorize,ask);
 expect(landing.statusCode).toBe(200);
 expect(landing.body).toContain('Continue with Google');
 const href=landing.body.match(/class="button" href="([^"]+)"/)[1].replace(/&amp;/g,'&');
 const toGoogle=await get(start,query(href));
 expect(toGoogle.statusCode).toBe(302);
 // One sign-in asks Google for everything it will grant.
 expect(toGoogle.headers.Location).toContain('group=complete');
 const state=new URL(toGoogle.headers.Location).searchParams.get('state');
 const back=await get(callback,{state,code:'google-code'});
 expect(back.statusCode).toBe(302);
 const approve=new URL(back.headers.Location);
 expect(approve.pathname).toBe('/api/oauth/authorize');
 expect(approve.searchParams.get('connect')).toMatch(/^p10h_/);
 return get(authorize,Object.fromEntries(approve.searchParams));
}

describe('a stranger connects cold, with no roster and no cookies',()=>{
 it('"Not you?" sets the earlier sign-in aside and starts Google\'s account chooser again',async()=>{
  const page=await signInToApprove();
  const link=page.body.match(/<a href="([^"]+)">Not you\? Use a different Google account<\/a>/);
  expect(link).toBeTruthy();
  const url=new URL(link[1].replace(/&amp;/g,'&'),BASE);
  expect(url.searchParams.get('switch')).toBe('1');
  expect(url.searchParams.get('connect')).toBeNull();
  const again=await get(authorize,Object.fromEntries(url.searchParams));
  expect(again.statusCode).toBe(200);
  expect(again.body).toContain('Continue with Google');
  expect(again.body).not.toContain('Approve</button>');
  // The old browser sign-in is cleared.
  expect(String(again.headers['Set-Cookie'])).toMatch(/Max-Age=0/);
 });
 it('signs in, lands on Approve with the account already linked, and approves',async()=>{
  const page=await signInToApprove();
  expect(page.statusCode).toBe(200);
  expect(page.body).not.toContain('Sign-in did not stick');
  expect(page.body).toContain('stranger@example.test');
  expect(page.body).toContain('agent.meta.ai');
  expect(page.body).toContain('Add another Google account');
  expect(h.links).toHaveLength(1);
  expect(h.links[0]).toMatchObject({principalId:P,verifiedEmail:'stranger@example.test'});
  const done=await post(authorize,{...ask,resource:hidden(page.body,'resource'),connect:hidden(page.body,'connect'),
   account_id:h.accounts[0].id,profile:'full'},{form:true});
  expect(done.statusCode).toBe(302);
  const back=new URL(done.headers.Location);
  expect(back.origin+back.pathname).toBe(CB);
  expect(back.searchParams.get('code')).toMatch(/^p10c_/);
  expect(back.searchParams.get('state')).toBe('muse-state');
  expect(h.issued[0]).toMatchObject({principalId:P,accountId:h.accounts[0].id,clientId:'muse',profile:'full'});
  // The Approve handle is spent: tapping again cannot issue a second code.
  const again=await post(authorize,{...ask,resource:hidden(page.body,'resource'),connect:hidden(page.body,'connect'),
   account_id:h.accounts[0].id},{form:true});
  expect(again.statusCode).toBe(401);
  expect(h.issued).toHaveLength(1);
 });

 it('adds a second Google account from the Approve page and comes back to it',async()=>{
  const page=await signInToApprove();
  h.nextSub='stranger-sub-2';h.nextEmail='second@example.test';
  const add=await post(start,{purpose:'link',connect:hidden(page.body,'connect')});
  expect(add.statusCode).toBe(302);
  const state=new URL(add.headers.Location).searchParams.get('state');
  expect(new URL(add.headers.Location).searchParams.get('group')).toBe('complete');
  // The page's handle was spent by the add; the old page cannot approve.
  expect(await post(authorize,{...ask,resource:hidden(page.body,'resource'),connect:hidden(page.body,'connect'),
   account_id:h.accounts[0].id},{form:true}).then(r=>r.statusCode)).toBe(401);
  const back=await get(callback,{state,code:'google-code-2'});
  expect(back.statusCode).toBe(302);
  expect(h.links.map(l=>l.verifiedEmail)).toEqual(['stranger@example.test','second@example.test']);
  expect(h.links[1].principalId).toBe(P);
  const refreshed=await get(authorize,query(back.headers.Location));
  expect(refreshed.statusCode).toBe(200);
  expect(refreshed.body).toContain('stranger@example.test');
  expect(refreshed.body).toContain('second@example.test');
  const done=await post(authorize,{...ask,resource:hidden(refreshed.body,'resource'),connect:hidden(refreshed.body,'connect'),
   account_id:h.accounts[1].id},{form:true});
  expect(done.statusCode).toBe(302);
  expect(h.issued[0].accountId).toBe(h.accounts[1].id);
 });

 it('a refused second account comes back to Approve saying why, and can still approve',async()=>{
  const page=await signInToApprove();
  h.nextSub='stranger-sub-3';h.nextEmail='taken@example.test';h.linkFailure='identity_owned_elsewhere';
  const add=await post(start,{purpose:'link',connect:hidden(page.body,'connect')});
  const back=await get(callback,{state:new URL(add.headers.Location).searchParams.get('state'),code:'g'});
  expect(back.statusCode).toBe(302);
  expect(new URL(back.headers.Location).searchParams.get('link_refused')).toBe('1');
  const again=await get(authorize,query(back.headers.Location));
  expect(again.statusCode).toBe(200);
  expect(again.body).toContain('already connected to a different person');
  expect(again.body).toContain('>Approve<');
 });

 it('a handle for one app cannot approve another app or address',async()=>{
  const page=await signInToApprove();
  const wrong=await get(authorize,{...ask,code_challenge:'d'.repeat(43),connect:hidden(page.body,'connect'),returned:'1'});
  expect(wrong.statusCode).toBe(400);
  expect(wrong.body).toContain('Sign-in did not stick');
  expect(h.issued).toHaveLength(0);
 });

 it('a named connector address (/api/mcp/test) goes through the same door and binds the code to that address',async()=>{
  const named={...ask,resource:BASE+'/api/mcp/test'};
  const landing=await get(authorize,named);
  expect(landing.statusCode).toBe(200);
  const href=landing.body.match(/class="button" href="([^"]+)"/)[1].replace(/&amp;/g,'&');
  expect(query(href).resource).toBe(BASE+'/api/mcp/test');
  const toGoogle=await get(start,query(href));
  expect(toGoogle.statusCode).toBe(302);
  const back=await get(callback,{state:new URL(toGoogle.headers.Location).searchParams.get('state'),code:'g'});
  const page=await get(authorize,query(back.headers.Location));
  expect(page.statusCode).toBe(200);
  const done=await post(authorize,{...named,resource:hidden(page.body,'resource'),connect:hidden(page.body,'connect'),
   account_id:h.accounts[0].id,profile:'read_only'},{form:true});
  expect(done.statusCode).toBe(302);
  expect(h.issued[0]).toMatchObject({resource:BASE+'/api/mcp/test',profile:'read_only'});
  // A name that is not a valid label is refused at the door.
  const bad=await get(authorize,{...ask,resource:BASE+'/api/mcp/Not_OK'});
  expect(bad.statusCode).toBe(400);
 });
 it('a made-up handle starts nothing on the add-account door',async()=>{
  const add=await post(start,{purpose:'link',connect:'p10h_'+'z'.repeat(43)});
  expect(add.statusCode).toBe(400);
 });
});
