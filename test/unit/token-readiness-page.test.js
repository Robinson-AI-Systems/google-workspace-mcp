import {describe,it,expect,vi,beforeEach} from 'vitest';
import {Readable} from 'node:stream';
const mocks=vi.hoisted(()=>({initSchema:vi.fn(),inspectGoogleTokenRetirement:vi.fn(),
 recordLoginAttempt:vi.fn(),countRecentFailedLogins:vi.fn(),markLoginAttemptSucceeded:vi.fn()}));
vi.mock('../../src/db.js',()=>mocks);
const {default:handler}=await import('../../api/owner/token-readiness.js');
function response(){const r={headers:{},statusCode:200,body:''};
 r.setHeader=(k,v)=>r.headers[k]=v;r.status=n=>(r.statusCode=n,r);
 r.send=s=>(r.body=String(s),r);r.writeHead=(n,h)=>(r.statusCode=n,Object.assign(r.headers,h),r);r.end=()=>r;return r;}
const origin='https://rtc.example.test';
const sample=()=>({encryptedOnly:false,accountsChecked:2,ready:false,problems:{missingKey:false,noAccounts:false,
 missingCopy:0,corruptOrStale:0,unverifiedBackfill:1,refreshNotObserved:1},notBefore:'2026-11-01T06:00:00Z'});
async function request(body={passphrase:'fake-owner-passphrase'},headers={origin},method='POST'){
 const r=response();await handler({method,headers,body},r);return r;
}
beforeEach(()=>{vi.resetAllMocks();process.env.PUBLIC_BASE_URL=origin;process.env.ADMIN_PASSPHRASE='fake-owner-passphrase';
 mocks.recordLoginAttempt.mockResolvedValue(1);mocks.countRecentFailedLogins.mockResolvedValue(1);
 mocks.inspectGoogleTokenRetirement.mockResolvedValue(sample());});
describe('owner-only token readiness inspection',()=>{
 it('renders only a safe same-origin form without touching account storage',async()=>{
  const r=await request(undefined,{host:'rtc.example.test'},'GET');expect(r.statusCode).toBe(200);
  expect(r.headers['Referrer-Policy']).toBe('same-origin');expect(r.headers['Cache-Control']).toContain('no-store');
  expect(r.headers['Content-Security-Policy']).toContain("form-action 'self'");expect(r.body).toContain('method="POST"');
  expect(r.body).not.toContain('accountsChecked');expect(mocks.initSchema).not.toHaveBeenCalled();
 });
 it('redirects aliases to the exact canonical form without data access',async()=>{
  const r=await request(undefined,{host:'alias.example.test'},'GET');expect(r.statusCode).toBe(303);
  expect(r.headers.Location).toBe(origin+'/api/owner/token-readiness');expect(r.headers['Referrer-Policy']).toBe('no-referrer');
  expect(mocks.initSchema).not.toHaveBeenCalled();
 });
 it.each([undefined,'null','',origin+'/', 'https://foreign.example.test'])('refuses nonexact Origin %s before login',async value=>{
  const r=await request(undefined,{origin:value});expect(r.statusCode).toBe(403);
  expect(mocks.initSchema).not.toHaveBeenCalled();expect(mocks.inspectGoogleTokenRetirement).not.toHaveBeenCalled();
 });
 it('returns only whitelisted sanitized counts after real existing owner authentication',async()=>{
  mocks.inspectGoogleTokenRetirement.mockResolvedValue({...sample(),tokens:'never-return-this',key:'also-secret',account:'private@example.test'});
  const r=await request();expect(r.statusCode).toBe(200);expect(r.body).toContain('&quot;accountsChecked&quot;: 2');
  expect(r.body).toContain('&quot;refreshNotObserved&quot;: 1');expect(r.body).not.toMatch(/never-return-this|also-secret|private@example/);
  expect(r.headers['Referrer-Policy']).toBe('no-referrer');expect(mocks.inspectGoogleTokenRetirement).toHaveBeenCalledTimes(1);
  expect(mocks.markLoginAttemptSucceeded).toHaveBeenCalledWith(1);
 });
 it('supports the actual urlencoded browser form',async()=>{
  const req=Readable.from(['passphrase=fake-owner-passphrase']);req.method='POST';
  req.headers={origin,'content-type':'application/x-www-form-urlencoded'};const r=response();await handler(req,r);
  expect(r.statusCode).toBe(200);expect(mocks.inspectGoogleTokenRetirement).toHaveBeenCalledTimes(1);
 });
 it('refuses wrong owner credentials before inspection',async()=>{
  const r=await request({passphrase:'wrong'});expect(r.statusCode).toBe(401);
  expect(mocks.inspectGoogleTokenRetirement).not.toHaveBeenCalled();
 });
 it('preserves shared login lockout even with the correct credential',async()=>{
  mocks.countRecentFailedLogins.mockResolvedValue(6);const r=await request();expect(r.statusCode).toBe(429);
  expect(r.headers['Retry-After']).toBe('900');expect(mocks.inspectGoogleTokenRetirement).not.toHaveBeenCalled();
 });
 it.each([{passphrase:'fake-owner-passphrase',activate:true},{passphrase:'fake-owner-passphrase',account:'x'},[],{passphrase:'x'.repeat(1025)}])('refuses activation/selection/invalid bodies %j',async body=>{
  const r=await request(body);expect(r.statusCode).toBe(400);expect(mocks.initSchema).not.toHaveBeenCalled();
 });
 it('hides persistence or decryption exceptions rather than echoing secret-bearing messages',async()=>{
  mocks.inspectGoogleTokenRetirement.mockRejectedValue(Error('private-key-token'));const r=await request();
  expect(r.statusCode).toBe(503);expect(r.body).not.toContain('private-key-token');
 });
 it('fails closed for malformed inspection output',async()=>{
  mocks.inspectGoogleTokenRetirement.mockResolvedValue({ready:true});const r=await request();expect(r.statusCode).toBe(503);
 });
 it('fails closed without configured origin or owner authentication',async()=>{
  delete process.env.PUBLIC_BASE_URL;expect((await request()).statusCode).toBe(503);
  process.env.PUBLIC_BASE_URL=origin;delete process.env.ADMIN_PASSPHRASE;expect((await request()).statusCode).toBe(503);
  expect(mocks.inspectGoogleTokenRetirement).not.toHaveBeenCalled();
 });
 it('has no other supported method',async()=>{expect((await request(undefined,{origin},'DELETE')).statusCode).toBe(405);
  expect(mocks.inspectGoogleTokenRetirement).not.toHaveBeenCalled();});
});
