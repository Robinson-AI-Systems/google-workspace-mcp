import {describe,it,expect,vi,beforeEach} from 'vitest';
import {startGoogleSetup,verifyGoogleSetup,clearGoogleSetupCookie} from '../../src/oauth/google-setup-state.js';
const fixtures=vi.hoisted(()=>({url:null,calls:0}));
vi.mock('../../src/auth/google-auth-hosted.js',()=>({
 getGoogleAuthUrl:state=>{fixtures.url=state;return 'https://accounts.google.test/o/oauth2?state='+encodeURIComponent(state);},
 handleGoogleCallback:async()=>{fixtures.calls++;return 'ops@example.test';}
}));
vi.mock('../../src/db.js',()=>({initSchema:async()=>{}}));
const {default:authorize}=await import('../../api/google/authorize.js');
const {default:callback}=await import('../../api/google/callback.js');
function response(){
 const r={statusCode:200,headers:{},body:''};
 r.setHeader=(key,value)=>{r.headers[key]=value;};
 r.writeHead=(n,headers)=>{r.statusCode=n;Object.assign(r.headers,headers);};
 r.status=n=>{r.statusCode=n;return r;};
 r.send=value=>{r.body=String(value);return r;};
 r.end=()=>r;return r;
}
beforeEach(()=>{fixtures.calls=0;fixtures.url=null;});
describe('owner Google OAuth connection setup',()=>{
 it('binds callback to a fresh browser nonce rather than accepting arbitrary state',()=>{
  const start=startGoogleSetup('<unsafe>');
  const cookie=start.cookie.split(';')[0];
  expect(verifyGoogleSetup(start.state,cookie)).toMatchObject({label:'<unsafe>'});
  expect(verifyGoogleSetup(start.state,'')).toBeNull();
  expect(verifyGoogleSetup(start.state,cookie,Date.now()+601000)).toBeNull();
  const tampered=new URLSearchParams(start.state);tampered.set('nonce','a'.repeat(32));
  expect(verifyGoogleSetup(tampered.toString(),cookie)).toBeNull();
  expect(clearGoogleSetupCookie()).toMatch(/Max-Age=0/);
 });
 it('starts with a secure, same-site browser cookie and no-store redirect',()=>{
  const res=response();authorize({method:'GET',query:{label:'Owner'},headers:{}},res);
  expect(res.statusCode).toBe(302);
  expect(res.headers.Location).toMatch(/^https:\/\/accounts\.google\.test/);
  expect(res.headers['Set-Cookie']).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  expect(res.headers['Cache-Control']).toBe('no-store');
  expect(fixtures.url).toMatch(/setup=1/);
 });
 it('rejects unsolicited and replay-shaped callbacks before touching the provider',async()=>{
  const bad=response();await callback({method:'GET',query:{state:'setup=1&label=attacker',code:'danger'},headers:{}},bad);
  expect(bad.statusCode).toBe(400);expect(fixtures.calls).toBe(0);
  const start=startGoogleSetup('Accepted');const cookie=start.cookie.split(';')[0];
  const ok=response();await callback({method:'GET',query:{state:start.state,code:'authorized'},headers:{cookie}},ok);
  expect(ok.statusCode).toBe(200);expect(fixtures.calls).toBe(1);
  expect(ok.body).toContain('Connected:');
  expect(ok.headers['Set-Cookie']).toMatch(/Max-Age=0/);
 });
 it('never echoes a provider error or untrusted query into HTML',async()=>{
  const start=startGoogleSetup(),cookie=start.cookie.split(';')[0];
  const res=response();await callback({method:'GET',query:{state:start.state,error:'<script>alert(1)</script>'},headers:{cookie}},res);
  expect(res.statusCode).toBe(400);expect(res.body).not.toContain('<script>');
  expect(fixtures.calls).toBe(0);
 });
});
