// CONTROLS-1 (owner ruling 2026-11-09): My Workspace connections lets a
// person change each app's access level, make every app read-only at once,
// and see plain status words. Buttons answer with a page, never raw JSON.
import {describe,it,expect,vi,beforeEach} from 'vitest';
import {createHash} from 'node:crypto';
const P='33333333-3333-4333-8333-333333333333',C='55555555-5555-4555-8555-555555555555',A='44444444-4444-4444-8444-444444444444';
const csrf='p10x_'+'b'.repeat(43),secret='p10s_'+'a'.repeat(43);
const h=vi.hoisted(()=>({paused:false,profiles:{},revoked:[],calls:[]}));
vi.mock('../../src/db.js',()=>({initSchema:async()=>{},
 getOAuthClient:async id=>id==='claude-client'?{client_id:id,client_name:'Claude',redirect_uris:[]}:null}));
vi.mock('../../src/principals/delegation.js',()=>({listCustomerDelegations:async()=>[],configureCustomerDelegation:async()=>({}),
 revokeCustomerDelegation:async()=>({}),addVerifiedDelegationSubject:async()=>({}),removeDelegationSubject:async()=>({})}));
vi.mock('../../src/principals/store.js',()=>({
 readSession:async s=>s===secret?{principal_id:P,csrf_hash:createHash('sha256').update(csrf).digest('hex'),kind:'user'}:null,
 listAccounts:async()=>[{id:A,email:'me@example.test',label:null,is_default:true,scope_list:['openid','https://www.googleapis.com/auth/gmail.modify']}],
 listConnections:async()=>[
  {id:C,account_id:A,client_id:'claude-client',profile:h.profiles[C]||'full',created_at:new Date(),expires_at:new Date(Date.now()+86400e3),revoked_at:null},
  {id:'66666666-6666-4666-8666-666666666666',account_id:A,client_id:'muse',profile:'read_only',expires_at:new Date(Date.now()+86400e3),revoked_at:null},
  {id:'77777777-7777-4777-8777-777777777777',account_id:A,client_id:'gone-client',profile:'full',revoked_at:new Date()}],
 getLatestLinkDenial:async()=>null,getWritesPaused:async()=>h.paused,
 setWritesPaused:async(_p,v)=>{h.calls.push(['pause',v]);h.paused=v;return v;},
 setConnectionProfile:async(_p,id,profile)=>{if(!['full','everyday','read_only'].includes(profile))throw Error('invalid_profile');h.profiles[id]=profile;return profile;},
 revokeConnection:async(_p,id)=>{h.revoked.push(id);return 1;},
 isLegacyPilotIdentityPrincipal:async()=>false,canLegacyPilotStartFreshConsent:async()=>false,
 getSigninDenial:async()=>null,deleteSigninDenial:async()=>{},disconnectAccount:async()=>1,deletionPreview:async()=>({accounts:1,connections:2}),
 setPrincipalDefault:async()=>A,requestDeletion:async()=>({pending:true}),cancelDeletion:async()=>({cancelled:true}),getLinkedGrant:async()=>null
}));
vi.mock('../../src/principals/google.js',async importActual=>({...(await importActual()),publicGoogleClient:()=>({})}));
const {default:account}=await import('../../api/account.js');
const cookie=`p10_session=${secret}; p10_csrf=${csrf}`;
const res=()=>{const x={statusCode:200,headers:{},body:null};x.setHeader=(k,v)=>{x.headers[k]=v;};
 x.status=n=>{x.statusCode=n;return x;};x.send=v=>{x.body=String(v);return x;};x.json=v=>{x.body=v;return x;};
 x.writeHead=(n,o={})=>{x.statusCode=n;Object.assign(x.headers,o);};x.end=()=>x;return x;};
const call=async(method,body)=>{const out=res();process.env.PUBLIC_BASE_URL='https://ws.example.test';
 await account({method,query:method==='GET'?(body||{}):{},body:method==='POST'?{csrf,...body}:undefined,
  headers:{cookie,host:'ws.example.test'},url:'/api/account'},out);return out;};
beforeEach(()=>{h.paused=false;h.profiles={};h.revoked=[];h.calls=[];});

describe('My Workspace connections',()=>{
 it('lists live apps by the name people know, with plain status tags; revoked apps are gone',async()=>{
  const page=await call('GET');
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain('<b>Claude</b>');
  expect(page.body).toContain('<b>Muse</b>');
  expect(page.body).not.toContain('gone-client');
  expect(page.body).toContain('can make changes');
  expect(page.body).toContain('read-only');
  expect(page.body).toContain('Connected: Gmail.');
  expect(page.body).not.toContain('gmail.modify');
  expect(page.body).toContain('Make all my apps read-only');
 });
 it('changing one app\'s access level answers with the page again and a plain notice',async()=>{
  const out=await call('POST',{action:'set_profile',id:C,profile:'everyday',return:'page'});
  expect(out.statusCode).toBe(303);
  expect(out.headers.Location).toBe('/api/account?notice=set_profile');
  expect(h.profiles[C]).toBe('everyday');
  const page=await call('GET',{notice:'set_profile'});
  expect(page.body).toContain('Saved. The new access level applies');
  expect(page.body).toMatch(/value="everyday" checked/);
 });
 it('one switch makes every app read-only, and turns changes back on',async()=>{
  expect((await call('POST',{action:'pause_writes',return:'page'})).headers.Location).toBe('/api/account?notice=pause_writes');
  expect(h.paused).toBe(true);
  const paused=await call('GET');
  expect(paused.body).toContain('All your apps are read-only right now.');
  expect(paused.body).toContain('changes paused');
  expect(paused.body).toContain('Let my apps make changes again');
  await call('POST',{action:'resume_writes',return:'page'});
  expect(h.paused).toBe(false);
 });
 it('a refused change shows a page saying nothing changed, never raw JSON',async()=>{
  const out=await call('POST',{action:'set_profile',id:C,profile:'root',return:'page'});
  expect(out.statusCode).toBe(400);
  expect(out.body).toContain('Nothing was changed');
  expect(h.profiles[C]).toBeUndefined();
 });
 it('scripts that omit return=page still get JSON',async()=>{
  const out=await call('POST',{action:'set_profile',id:C,profile:'read_only'});
  expect(out.statusCode).toBe(200);expect(out.body).toEqual({profile:'read_only'});
 });
 it('without the CSRF token nothing changes',async()=>{
  const out=res();await account({method:'POST',query:{},body:{action:'pause_writes',return:'page'},headers:{cookie,host:'ws.example.test'},url:'/api/account'},out);
  expect(h.paused).toBe(false);expect(out.statusCode).toBe(403);
 });
 it('the preview of stored data is a readable page',async()=>{
  const out=await call('POST',{action:'delete_preview',return:'page'});
  expect(out.statusCode).toBe(200);expect(out.body).toContain('Nothing has been removed');expect(out.body).toContain('connections: 2');
 });
});
