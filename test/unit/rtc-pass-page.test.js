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
});
describe('owner RTC pass setup',()=>{
 it('rejects cross-site issuance before reading the passphrase',async()=>{
  const res=await post({passphrase:process.env.ADMIN_PASSPHRASE,google_account:'ops@example.test'},'https://evil.example.test');
  expect(res.statusCode).toBe(403);
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
  const token=res.body.match(/rtc_pass_[A-Za-z0-9_-]{43}/)?.[0];
  expect(token).toBeTruthy();
  const pass=await holder.db.getRtcPass(token);
  expect(pass).toMatchObject({profile:'read_only',mode:'test',allow_writes:false,areas:['mail'],rate_limit_per_minute:5});
  expect(JSON.stringify(await holder.db.listRtcPasses())).not.toContain(token);
  expect(await holder.db.chargeRtcPass(pass.id,5)).toBe(true);
  expect((await holder.db.revokeConnection(pass.id)).revoked).toBe(1);
  expect(await holder.db.getRtcPass(token)).toBeNull();
 });
});
