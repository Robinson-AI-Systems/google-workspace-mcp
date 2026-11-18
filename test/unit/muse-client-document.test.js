// Muse can be given this server's own published client document address as
// its Client ID. Every sign-in door must recognise that exact address as the
// built-in Muse client without any database registration (a cleanup that
// revokes registrations must not break it), and nothing else may pass for it.
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
import {Readable} from 'node:stream';
const h=vi.hoisted(()=>({started:null,consumed:[],refreshed:[],dbLookups:0}));
vi.mock('../../src/db.js',async importActual=>{
 const real=await importActual();
 return {...real,initSchema:async()=>{},listGoogleAccounts:async()=>[],createAuthCode:async()=>{},
  recordLoginAttempt:async()=>{},countRecentFailedLogins:async()=>0,markLoginAttemptSucceeded:async()=>{},
  consumeAuthCode:async()=>null,createAccessToken:async()=>null,getTokenByRefreshToken:async()=>null,
  // Real lookup for published documents; anything that would need the
  // database is counted and answered "not registered".
  getOAuthClient:async id=>{const published=(await import('../../src/oauth/client-documents.js')).documentClient(id);
   if(published)return real.getOAuthClient(id);h.dbLookups++;return null;}};
});
vi.mock('../../src/auth/google-auth-hosted.js',()=>({ensureMigrated:async()=>null}));
vi.mock('../../src/principals/store.js',()=>({
 getPrincipal:async()=>null,listAccounts:async()=>[],issuePrincipalCode:async()=>'p10c_'+'c'.repeat(43),
 createSession:async()=>({secret:'',csrf:''}),revokeSession:async()=>0,readSession:async()=>null,
 createTransaction:async input=>{h.started=input;return true;},
 isLegacyPilotIdentityPrincipal:async()=>false,canLegacyPilotStartFreshConsent:async()=>true,
 consumePrincipalCode:async values=>{h.consumed.push(values);return {principal_id:'p',client_id:values.clientId};},
 issuePrincipalConnection:async()=>({accessToken:'p10a_access',refreshToken:'p10r_refresh'}),
 rotatePrincipalRefresh:async(_t,values)=>{h.refreshed.push(values);return {accessToken:'p10a_new',refreshToken:'p10r_new'};}
}));
vi.mock('../../src/principals/google.js',async importActual=>({...(await importActual()),
 publicGoogleClient:()=>({}),providerUrl:()=>'https://accounts.google.com/o/oauth2/v2/auth?fake=1'}));
vi.mock('../../src/oauth/login-guard.js',()=>({clientIp:()=>'',LOCKOUT_WINDOW_MINUTES:15,evaluateLogin:async()=>({status:'wrong',attemptsLeft:4})}));

const {documentClient,museClientDocument,isMuseClient,MUSE_REDIRECT_URI}=await import('../../src/oauth/client-documents.js');
const {getOAuthClient}=await vi.importActual('../../src/db.js');
const {default:authorize}=await import('../../api/oauth/authorize.js');
const {default:start}=await import('../../api/auth/google/start.js');
const {default:token}=await import('../../api/oauth/token.js');
const {default:wellKnown}=await import('../../api/well-known/muse-client.js');

const BASE='https://workspace.example.test',DOC=BASE+'/.well-known/muse-client.json';
const res=()=>{const x={statusCode:200,headers:{},body:null};
 x.setHeader=(k,v)=>{x.headers[k]=v;};x.status=n=>{x.statusCode=n;return x;};
 x.send=v=>{x.body=String(v);return x;};x.json=v=>{x.body=v;return x;};
 x.writeHead=(n,hdr={})=>{x.statusCode=n;Object.assign(x.headers,hdr);};x.end=()=>x;return x;};
const get=async(handler,query)=>{const out=res();await handler({method:'GET',query,headers:{host:'workspace.example.test'},url:'/'},out);return out;};
const post=async(handler,body)=>{const req=Readable.from([new URLSearchParams(body).toString()]);
 req.method='POST';req.query={};req.headers={'content-type':'application/x-www-form-urlencoded'};const out=res();await handler(req,out);return out;};
const ask={client_id:DOC,redirect_uri:MUSE_REDIRECT_URI,response_type:'code',state:'muse-state',
 code_challenge:'c'.repeat(43),code_challenge_method:'S256'};

let env;
beforeEach(()=>{env={...process.env};process.env.PUBLIC_BASE_URL=BASE;process.env.PUBLIC_SIGNIN_MODE='pilot';
 h.started=null;h.consumed=[];h.refreshed=[];h.dbLookups=0;});
afterEach(()=>{process.env=env;});

describe('the published Muse client document',()=>{
 it('is recognised exactly, and nothing else passes for it',()=>{
  expect(documentClient(DOC)).toEqual({client_id:DOC,client_secret:null,redirect_uris:[MUSE_REDIRECT_URI],client_name:'Muse'});
  for(const other of ['muse','http://workspace.example.test/.well-known/muse-client.json',
   'https://evil.example/.well-known/muse-client.json','https://workspace.example.test/.well-known/muse-client.json/',
   'https://workspace.example.test/.well-known/other.json','https://workspace.example.test.evil.example/.well-known/muse-client.json',
   DOC+'?x=1',undefined,null,42])expect(documentClient(other)).toBeNull();
  expect(isMuseClient('muse')).toBe(true);expect(isMuseClient(DOC)).toBe(true);expect(isMuseClient('registered')).toBe(false);
 });
 it('is not recognised when the public address is not configured',()=>{
  delete process.env.PUBLIC_BASE_URL;expect(documentClient(DOC)).toBeNull();
 });
 it('the served document and the built-in client are the same client',async()=>{
  const out=res();wellKnown({},out);
  expect(out.body).toEqual(museClientDocument());
  expect(out.body.client_id).toBe(DOC);
  expect((await getOAuthClient(out.body.client_id)).redirect_uris).toEqual(out.body.redirect_uris);
 });
 it('getOAuthClient answers it without the database (survives registration cleanups)',async()=>{
  expect(await getOAuthClient(DOC)).toMatchObject({client_id:DOC,client_secret:null});
 });
});

describe('every sign-in door accepts it',()=>{
 it('authorize: the sign-in page opens instead of "Unknown client_id"',async()=>{
  const page=await get(authorize,ask);
  expect(page.statusCode).toBe(200);
  expect(page.body).not.toContain('Unknown client_id');
  expect(h.dbLookups).toBe(0);
 });
 it('authorize: a wrong return address is still refused',async()=>{
  const page=await get(authorize,{...ask,redirect_uri:'https://evil.example/cb'});
  expect(page.statusCode).toBe(400);expect(page.body).toContain('redirect_uri does not match');
 });
 it('authorize → Google: omitted resource means this server, and the hand-off reaches Google',async()=>{
  const landing=await get(authorize,{...ask,auth_method:'google'});
  expect(landing.statusCode).toBe(200);
  const href=landing.body.match(/class="button" href="([^"]+)"/)[1].replace(/&amp;/g,'&');
  const next=new URL(href);
  expect(next.pathname).toBe('/api/auth/google/start');
  expect(next.searchParams.get('client_id')).toBe(DOC);
  expect(next.searchParams.get('resource')).toBe(BASE+'/api/mcp');
  const toGoogle=await get(start,Object.fromEntries(next.searchParams));
  expect(toGoogle.statusCode).toBe(302);
  expect(toGoogle.headers.Location).toMatch(/^https:\/\/accounts\.google\.com\//);
  expect(h.started).toMatchObject({clientId:DOC,redirectUri:MUSE_REDIRECT_URI,resource:BASE+'/api/mcp'});
 });
 it('token: code exchange and refresh work with resource omitted; a foreign resource is refused',async()=>{
  const code=await post(token,{grant_type:'authorization_code',client_id:DOC,code:'p10c_x',redirect_uri:MUSE_REDIRECT_URI,code_verifier:'A'.repeat(43)});
  expect(code.statusCode).toBe(200);expect(code.body.refresh_token).toBe('p10r_refresh');
  expect(h.consumed[0]).toMatchObject({clientId:DOC,redirectUri:MUSE_REDIRECT_URI});
  const refresh=await post(token,{grant_type:'refresh_token',client_id:DOC,refresh_token:'p10r_refresh'});
  expect(refresh.statusCode).toBe(200);expect(h.refreshed[0]).toMatchObject({clientId:DOC,resource:BASE+'/api/mcp'});
  const foreign=await post(token,{grant_type:'refresh_token',client_id:DOC,refresh_token:'p10r_refresh',resource:'https://evil.example/api/mcp'});
  expect(foreign.statusCode).toBe(400);expect(foreign.body.error).toBe('invalid_target');
 });
});
