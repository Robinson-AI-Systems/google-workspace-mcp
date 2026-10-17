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
 r.writeHead=(n,headers)=>{r.statusCode=n;Object.assign(r.headers,headers);return r;};
 r.end=()=>r;
 return r;
}
async function get(host){
 const r=response();await handler({method:'GET',headers:{host}},r);return r;
}
async function post(values,origin='https://rtc.example.test'){
 const req=Readable.from([new URLSearchParams(values).toString()]);
 req.method='POST';
 req.headers={'content-type':'application/x-www-form-urlencoded',origin,'x-vercel-forwarded-for':'127.0.0.11'};
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
 it('issues exact Chrome/domain form selections without broadening another area',async()=>{
  const page=await get('rtc.example.test');
  expect(page.body).toContain('name="areas"');
  for(const area of ['chrome','domain']){
   const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',hours:'24',areas:area});
   expect(res.statusCode).toBe(200);
   const rows=await holder.db.listRtcPasses();
   expect(rows.at(-1)).toMatchObject({profile:'read_only',allow_writes:false,areas:[area]});
  }
 });

 it('redirects an alias to the pinned canonical origin before rendering a secret-bearing form',async()=>{
  const alias=await get('rtc-alias.vercel.app');
  expect(alias.statusCode).toBe(303);
  expect(alias.headers.Location).toBe('https://rtc.example.test/api/rtc/passes');
  expect(alias.headers['Cache-Control']).toBe('no-store');
  const canonical=await get('rtc.example.test');
  expect(canonical.statusCode).toBe(200);
  expect(canonical.body).toContain('method="POST"');
  expect(canonical.body).toContain('value="1"');
  expect(canonical.headers['Referrer-Policy']).toBe('same-origin');
  expect(canonical.headers['Content-Security-Policy']).toContain("form-action 'self'");
  expect(alias.headers['Referrer-Policy']).toBe('no-referrer');
 });
 it('shows the safe canonical link on wrong-origin submission without issuing a pass',async()=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test'},'https://rtc-alias.vercel.app');
  expect(res.statusCode).toBe(403);
  expect(res.body).toContain('https://rtc.example.test/api/rtc/passes');
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('fails closed with explicit missing TEST allowlist and no owner credential check',async()=>{
  delete process.env.RTC_TEST_ACCOUNT_EMAILS;
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test'});
  expect(res.statusCode).toBe(503);
  expect(res.body).toContain('RTC_TEST_ACCOUNT_EMAILS');
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('supports form payloads parsed by the Vercel runtime',async()=>{
  const req={method:'POST',headers:{origin:'https://rtc.example.test','x-vercel-forwarded-for':'127.0.0.12'},
   body:{passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',areas:'mail',hours:'1'}};
  const res=response();await handler(req,res);
  expect(res.statusCode).toBe(200);
  expect(await holder.db.listRtcPasses()).toHaveLength(1);
 });
 it('rejects cross-site issuance before reading the passphrase',async()=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test'},'https://evil.example.test');
  expect(res.statusCode).toBe(403);
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it.each(['null', undefined, '', 'https://evil.example.test', 'https://rtc.example.test/'])('refuses an absent, opaque or nonexact form origin %s',async origin=>{
  const req={method:'POST',headers:{origin},body:{passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test'}};
  const res=response();await handler(req,res);
  expect(res.statusCode).toBe(403);
  expect(res.headers['Referrer-Policy']).toBe('no-referrer');
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('requires the real owner passphrase',async()=>{
  const res=await post({passphrase:'incorrect',google_account:'ops@example.test'});
  expect(res.statusCode).toBe(401);
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('issues only a read-only TEST pass and does not store the wire secret',async()=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test',hours:'24',rate_limit:'5',areas:'mail'});
  expect(res.statusCode).toBe(200);
  expect(res.headers['Referrer-Policy']).toBe('no-referrer');
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

 it('creates an explicitly authorized live full pass from a connected non-TEST account, preserving TEST defaults',async()=>{
  await holder.db.saveGoogleTokensFor('live@example.test',{access_token:'fake'});
  const fields={passphrase:process.env.ADMIN_PASSPHRASE,google_account:'live@example.test',mode:'live',
    profile:'full',areas:'admin,mail',hours:'72',allow_writes:'yes',
    confirmed_account:'live@example.test',cost_consent:'standing_assign',ack_unknown_charges:'yes'};
  const res=await post(fields);
  expect(res.statusCode).toBe(200);
  const token=res.body.match(/rtc_pass_[A-Za-z0-9_-]{43}/)?.[0];
  const pass=await holder.db.getRtcPass(token);
  expect(pass).toMatchObject({mode:'live',profile:'full',allow_writes:true,for_hub:false,
    google_account:'live@example.test',areas:['admin','mail'],cost_policy:{
      mode:'standing',account:'live@example.test',operations:['assign_license'],allowUnknownPrice:true,maxChargeUsd:null}});
  const issued=await holder.db.listRtcPasses();
  expect(JSON.stringify(issued)).not.toContain(token);
  process.env.RTC_TEST_ACCOUNT_EMAILS='other@example.test';
  expect(await holder.db.getRtcPass(token)).not.toBeNull();
  expect((await holder.db.revokeConnection(pass.id)).revoked).toBe(1);
  expect(await holder.db.getRtcPass(token)).toBeNull();
 });
 it('rejects live privilege widening, missing profile/area, cost cap bypass or unapproved standing charges',async()=>{
  await holder.db.saveGoogleTokensFor('live@example.test',{access_token:'fake'});
  const base={passphrase:process.env.ADMIN_PASSPHRASE,google_account:'live@example.test',
    mode:'live',profile:'full',areas:'admin',allow_writes:'yes',confirmed_account:'live@example.test'};
  for(const altered of [
    {profile:'read_only',allow_writes:'yes'},
    {profile:'full',allow_writes:undefined},
    {profile:'full',areas:''},
    {profile:'everyday',cost_consent:'standing_assign',ack_unknown_charges:'yes'},
    {profile:'full',cost_consent:'standing_assign'},
    {profile:'full',cost_consent:'standing_assign',ack_unknown_charges:'yes',areas:'mail'},
    {confirmed_account:'different@example.test'},
    {cost_consent:'bogus'}
  ]) {
    const res=await post({...base,...altered});
    expect(res.statusCode,JSON.stringify(altered)).toBe(400);
  }
  expect(await holder.db.listRtcPasses()).toHaveLength(0);
 });
 it('allows an explicitly selected read-only live Hub grant without borrowing TEST enrollment',async()=>{
  await holder.db.saveGoogleTokensFor('live@example.test',{access_token:'fake'});
  const out=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'live@example.test',
    mode:'live',profile:'read_only',areas:'mail',for_hub:'yes',hours:'8760'});
  expect(out.statusCode).toBe(200);
  const token=out.body.match(/rtc_pass_[A-Za-z0-9_-]{43}/)[0];
  expect(await holder.db.getRtcPass(token)).toMatchObject({mode:'live',profile:'read_only',for_hub:true,allow_writes:false});
 });

});
