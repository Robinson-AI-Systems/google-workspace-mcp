import {describe,it,expect,vi,beforeEach} from 'vitest';
import {Readable} from 'node:stream';
import {createFakeDb} from '../helpers/fake-db.js';
import {startGoogleSetup,verifyGoogleSetup} from '../../src/oauth/google-setup-state.js';
const holder=vi.hoisted(()=>({db:null,grants:0,connected:0,account:null}));
vi.mock('../../src/db.js',async actual=>{
 const real=await actual();
 return Object.fromEntries(Object.keys(real).map(name=>[name,(...args)=>holder.db[name](...args)]));
});
vi.mock('../../src/auth/google-auth-hosted.js',()=>({
 getGoogleAuthUrl:(state,account)=>{
  holder.grants++;holder.account=account;
  return 'https://accounts.google.test/consent?state='+encodeURIComponent(state);
 },
 handleGoogleCallback:async()=>{
  holder.connected++;return 'ops@robinsonappliancerentals.com';
 }
}));
const {default:authorize}=await import('../../api/google/authorize.js');
const {default:callback}=await import('../../api/google/callback.js');
const passphrase='fake-long-test-passphrase';
const origin='https://workspace.example.test';
function response(){
 const r={statusCode:200,headers:{},body:''};
 r.setHeader=(k,v)=>{r.headers[k]=v;};
 r.status=n=>{r.statusCode=n;return r;};
 r.send=s=>{r.body=String(s);return r;};
 r.writeHead=(n,headers)=>{r.statusCode=n;Object.assign(r.headers,headers);return r;};
 r.end=()=>r;return r;
}
async function submit(values={},headers={},raw=false){
 const req=raw?Readable.from([new URLSearchParams(values).toString()]):{body:values};
 req.method='POST';
 req.headers={origin,'x-vercel-forwarded-for':'127.0.0.14',...headers};
 if(raw)req.headers['content-type']='application/x-www-form-urlencoded';
 const res=response();await authorize(req,res);return res;
}
beforeEach(()=>{
 holder.db=createFakeDb();holder.grants=0;holder.connected=0;holder.account=null;
 process.env.PUBLIC_BASE_URL=origin;
 process.env.ADMIN_PASSPHRASE=passphrase;
 process.env.TOKEN_ENCRYPTION_KEY='not-real-test-signing-key-with-ample-length';
});
describe('protected owner-initiated Google setup',()=>{
 it('requires owner passphrase before it ever starts Google OAuth',async()=>{
  const page=response();await authorize({method:'GET',headers:{host:'workspace.example.test'},query:{}},page);
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain('Service owner passphrase');
  expect(holder.grants).toBe(0);
  const wrong=await submit({passphrase:'incorrect'});
  expect(wrong.statusCode).toBe(401);expect(holder.grants).toBe(0);
  const good=await submit({passphrase,account:'ops@robinsonappliancerentals.com'}, {},true);
  expect(good.statusCode).toBe(302);
  expect(good.headers['Set-Cookie']).toMatch(/HttpOnly; Secure; SameSite=Lax/);
  expect(holder.account).toBe('ops@robinsonappliancerentals.com');
  expect(holder.grants).toBe(1);
 });
 it('redirects alternate alias GETs safely and refuses foreign form submissions',async()=>{
  const page=response();await authorize({method:'GET',headers:{host:'some-alias.vercel.app'},query:{account:'test@example.test',label:'Company'}},page);
  expect(page.statusCode).toBe(303);
  expect(page.headers.Location).toMatch(/^https:\/\/workspace\.example\.test\/api\/google\/authorize\?/);
  expect((await submit({passphrase},{origin:'https://some-alias.vercel.app'})).statusCode).toBe(403);
  expect(holder.grants).toBe(0);
 });
 it('locks repeated owner attempts before any Google connection',async()=>{
  for(let i=0;i<5;i++)expect((await submit({passphrase:'bad-'+i})).statusCode).toBe(401);
  const locked=await submit({passphrase});
  expect(locked.statusCode).toBe(429);
  expect(locked.headers['Retry-After']).toBe('900');
  expect(holder.grants).toBe(0);
 });
 it('requires a fresh nonce cookie on the callback, without provider exchanges on failure',async()=>{
  const auth=await submit({passphrase,account:'ops@robinsonappliancerentals.com',label:'Appliance Rentals'});
  const u=new URL(auth.headers.Location);
  const state=u.searchParams.get('state');
  const cookie=auth.headers['Set-Cookie'].split(';')[0];
  expect(verifyGoogleSetup(state,cookie)).toMatchObject({label:'Appliance Rentals'});
  const unknown=response();await callback({method:'GET',query:{state,code:'real-code'},headers:{}},unknown);
  expect(unknown.statusCode).toBe(400);expect(holder.connected).toBe(0);
  const okay=response();await callback({method:'GET',query:{state,code:'real-code'},headers:{cookie}},okay);
  expect(okay.statusCode).toBe(200);expect(holder.connected).toBe(1);
  expect(okay.body).toContain('ops@robinsonappliancerentals.com');
  expect(okay.headers['Set-Cookie']).toMatch(/Max-Age=0/);
 });
 it('rejects fully attacker-chosen state AND cookie without a server-issued signature',async()=>{
  const nonce='A'.repeat(32);
  const forged=new URLSearchParams({setup:'1',nonce,issued:String(Date.now()),label:'Injected',mac:'Z'.repeat(43)}).toString();
  const cookie='google_setup_nonce='+nonce;
  expect(verifyGoogleSetup(forged,cookie)).toBeNull();
  const refused=response();await callback({method:'GET',query:{state:forged,code:'attacker-consent-code'},headers:{cookie}},refused);
  expect(refused.statusCode).toBe(400);
  expect(holder.connected).toBe(0);
 });
 it('fails closed when the service signing key is absent or rotated',async()=>{
  const issued=startGoogleSetup('Owner');
  const cookie=issued.cookie.split(';')[0];
  process.env.TOKEN_ENCRYPTION_KEY='a-different-test-key-with-ample-length';
  expect(verifyGoogleSetup(issued.state,cookie)).toBeNull();
  delete process.env.TOKEN_ENCRYPTION_KEY;
  expect(verifyGoogleSetup(issued.state,cookie)).toBeNull();
  expect(()=>startGoogleSetup()).toThrow(/signing key/);
  expect((await submit({passphrase})).statusCode).toBe(503);
  expect(holder.grants).toBe(0);
 });
 it('rejects expired, tampered, repeated and malicious callback state',async()=>{
  const {state,cookie}=startGoogleSetup('test');
  const nonce=cookie.split(';')[0];
  expect(verifyGoogleSetup(state,nonce,Date.now()+601000)).toBeNull();
  const tampered=new URLSearchParams(state);tampered.append('nonce','another');
  expect(verifyGoogleSetup(tampered.toString(),nonce)).toBeNull();
  const error=response();await callback({method:'GET',query:{state,error:'<script>bad()</script>'},headers:{cookie:nonce}},error);
  expect(error.statusCode).toBe(400);
  expect(error.body).not.toContain('<script>');
  expect(holder.connected).toBe(0);
 });
});
