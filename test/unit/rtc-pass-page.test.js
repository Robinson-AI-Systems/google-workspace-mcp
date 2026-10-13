import {describe,it,expect,vi,beforeEach} from 'vitest';
import {Readable} from 'node:stream';
import {createFakeDb} from '../helpers/fake-db.js';
const holder=vi.hoisted(()=>({db:null}));
vi.mock('../../src/db.js',async(importActual)=>{
 const real=await importActual();
 return Object.fromEntries(Object.keys(real).map(name=>[name,(...args)=>holder.db[name](...args)]));
});
const {default:handler}=await import('../../api/rtc/passes.js');
function response(){
 const r={statusCode:200,headers:{},body:''};
 r.setHeader=(k,v)=>{r.headers[k]=v;};
 r.status=n=>{r.statusCode=n;return r;};
 r.send=s=>{r.body=String(s);return r;};
 r.json=x=>{r.body=JSON.stringify(x);return r;};
 return r;
}
async function post(values,origin='https://rtc.example.test',extraHeaders={}){
 const req=Readable.from([new URLSearchParams(values).toString()]);
 req.method='POST';
 req.headers={'content-type':'application/x-www-form-urlencoded',origin,host:'rtc.example.test','x-vercel-forwarded-for':'127.0.0.11',...extraHeaders};
 const res=response();await handler(req,res);return res;
}
beforeEach(async()=>{
 holder.db=createFakeDb();
 await holder.db.saveGoogleTokensFor('ops@example.test',{access_token:'fake'});
 process.env.PUBLIC_BASE_URL='https://rtc.example.test';
 process.env.ADMIN_PASSPHRASE='test-passphrase-not-a-secret';
 process.env.RTC_TEST_ACCOUNT_EMAILS='ops@example.test';
});
describe('owner RTC pass setup',()=>{
 it('rejects cross-site issuance before reading the passphrase',async()=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test'},'https://evil.example.test');
  expect(res.statusCode).toBe(403);
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('permits a verified Vercel alias when the configured PUBLIC_BASE_URL is a legacy OAuth issuer',async()=>{
  process.env.PUBLIC_BASE_URL='https://legacy-project.vercel.app';
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',areas:'mail',hours:'1'},'https://current-project.vercel.app',{host:'current-project.vercel.app'});
  expect(res.statusCode).toBe(200);
  expect((await holder.db.listRtcPasses())).toHaveLength(1);
 });
 it('refuses origin-less POSTs unless the HTTPS referrer is from an approved same-origin page',async()=>{
  const fail=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test'},undefined,{origin:undefined});
  expect(fail.statusCode).toBe(403);
  const ok=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',areas:'mail',hours:'1'},undefined,{origin:undefined,referer:'https://rtc.example.test/api/rtc/passes'});
  expect(ok.statusCode).toBe(200);
  expect((await holder.db.listRtcPasses())).toHaveLength(1);
 });
 it('rejects cross-site Fetch Metadata even with a matching Origin or forged forwarding headers',async()=>{
  const data={passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',areas:'mail'};
  expect((await post(data,'https://rtc.example.test',{'sec-fetch-site':'cross-site'})).statusCode).toBe(403);
  expect((await post(data,'https://evil.vercel.app',{host:'rtc.example.test','x-forwarded-host':'evil.vercel.app'})).statusCode).toBe(403);
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('identifies incomplete owner setup before any password attempt or pass creation',async()=>{
  delete process.env.RTC_TEST_ACCOUNT_EMAILS;
  const get={method:'GET',headers:{host:'current-project.vercel.app'}};
  const page=response();await handler(get,page);
  expect(page.statusCode).toBe(200);
  expect(page.body).toContain('TEST account allowlist is not configured');
  expect(page.body).toContain('disabled');
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test'});
  expect(res.statusCode).toBe(503);
  expect((await holder.db.listRtcPasses())).toHaveLength(0);
 });
 it('requires the real owner passphrase',async()=>{
  const res=await post({passphrase:'incorrect',google_account:'ops@example.test'});
  expect(res.statusCode).toBe(401);
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('issues only a read-only TEST pass and does not store the wire secret',async()=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',hours:'24',rate_limit:'5',areas:'mail'});
  expect(res.statusCode).toBe(200);
  const token=res.body.match(/rtc_pass_[A-Za-z0-9_-]{43}/)?.[0];
  expect(token).toBeTruthy();
  const pass=await holder.db.getRtcPass(token);
  expect(pass).toMatchObject({profile:'read_only',mode:'test',allow_writes:false,areas:['mail'],rate_limit_per_minute:5});
  expect(JSON.stringify(await holder.db.listRtcPasses())).not.toContain(token);
  expect(await holder.db.chargeRtcPass(pass.id,5)).toBe(true);
  expect((await holder.db.revokeConnection(pass.id)).revoked).toBe(1);
  expect(await holder.db.getRtcPass(token)).toBeNull();
 });
 it('issues explicit short-lived area-restricted TEST writes only after account confirmation',async()=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',hours:'1',areas:'workspace,files,calendar,mail',allow_writes:'yes',confirmed_account:'ops@example.test'});
  expect(res.statusCode).toBe(200);
  const token=res.body.match(/rtc_pass_[A-Za-z0-9_-]{43}/)[0];
  expect(await holder.db.getRtcPass(token)).toMatchObject({mode:'test',profile:'full',allow_writes:true,areas:['workspace','files','calendar','mail'],for_hub:false});
  expect(res.headers['Cache-Control']).toContain('no-store');
  expect(JSON.stringify(await holder.db.listRtcPasses())).not.toContain(token);
 });
 it.each([
  {allow_writes:'yes',areas:'mail'},
  {allow_writes:'yes',areas:'mail',confirmed_account:'other@example.test'},
  {allow_writes:'yes',confirmed_account:'ops@example.test'},
  {allow_writes:'yes',areas:'mail',confirmed_account:'ops@example.test',hours:'25'},
  {allow_writes:'yes',areas:'mail',confirmed_account:'ops@example.test',hours:'8760',for_hub:'yes'},
  {allow_writes:'yes',areas:'mail',confirmed_account:'ops@example.test',hours:'1',for_hub:'yes'},
  {areas:'unknown'}
 ])('refuses unsafe pass choices %j',async options=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',...options});
  expect(res.statusCode).toBe(400);expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('keeps non-allowlisted real accounts refused even with write confirmation',async()=>{
  await holder.db.saveGoogleTokensFor('real@example.test',{access_token:'fake'});
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'real@example.test',allow_writes:'yes',confirmed_account:'real@example.test',areas:'mail'});
  expect(res.statusCode).toBe(400);expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('persists explicitly chosen year-long read-only Toolkit passes, with revocation and expiry',async()=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',for_hub:'yes',hours:'8760'});
  const token=res.body.match(/rtc_pass_[A-Za-z0-9_-]{43}/)[0];
  expect(await holder.db.getRtcPass(token)).toMatchObject({for_hub:true,profile:'read_only',allow_writes:false});
  expect((await holder.db.revokeConnection((await holder.db.getRtcPass(token)).id)).revoked).toBe(1);
  expect(await holder.db.getRtcPass(token)).toBeNull();
 });

});
