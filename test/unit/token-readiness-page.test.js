import {describe,it,expect,vi,beforeEach} from 'vitest';
import {Readable} from 'node:stream';
const mocks=vi.hoisted(()=>({initSchema:vi.fn(),inspectGoogleTokenRetirement:vi.fn(),
 activateGoogleTokenRetirement:vi.fn(),listGoogleAccounts:vi.fn(),recordLoginAttempt:vi.fn(),countRecentFailedLogins:vi.fn(),markLoginAttemptSucceeded:vi.fn(),refresh:vi.fn()}));
vi.mock('../../src/db.js',()=>mocks);
vi.mock('../../src/auth/google-auth-hosted.js',()=>({refreshConnectedAccountForReadiness:mocks.refresh}));
const {default:handler}=await import('../../api/owner/token-readiness.js');
function response(){const r={headers:{},statusCode:200,body:''};
 r.setHeader=(k,v)=>r.headers[k]=v;r.status=n=>(r.statusCode=n,r);
 r.send=s=>(r.body=String(s),r);r.writeHead=(n,h)=>(r.statusCode=n,Object.assign(r.headers,h),r);r.end=()=>r;return r;}
const origin='https://rtc.example.test';
const sample=()=>({encryptedOnly:false,accountsChecked:2,legacyPlaintextCopies:0,plaintextAccounts:2,ready:false,problems:{missingKey:false,noAccounts:false,
 missingCopy:0,corruptOrStale:0,unverifiedBackfill:1,refreshNotObserved:1},notBefore:null});
async function request(body={passphrase:'fake-owner-passphrase'},headers={origin},method='POST'){
 const r=response();await handler({method,headers,body},r);return r;
}
beforeEach(()=>{vi.resetAllMocks();process.env.PUBLIC_BASE_URL=origin;process.env.ADMIN_PASSPHRASE='fake-owner-passphrase';
 mocks.recordLoginAttempt.mockResolvedValue(1);mocks.countRecentFailedLogins.mockResolvedValue(1);
 mocks.inspectGoogleTokenRetirement.mockResolvedValue(sample());mocks.listGoogleAccounts.mockResolvedValue([{email:'a@example.test'},{email:'b@example.test'}]);});
describe('owner-only token readiness inspection',()=>{
 it('refreshes only the explicitly repeated account after owner authentication, then reinspects',async()=>{
  const r=await request({passphrase:'fake-owner-passphrase',action:'refresh',account:' OPS@EXAMPLE.TEST ',confirm_account:'ops@example.test'});
  expect(r.statusCode).toBe(200);expect(mocks.refresh).toHaveBeenCalledExactlyOnceWith('ops@example.test');
  expect(mocks.refresh.mock.invocationCallOrder[0]).toBeLessThan(mocks.inspectGoogleTokenRetirement.mock.invocationCallOrder[0]);
  expect(r.body).toContain('Existing account refreshed');
 });
 it.each([{account:'a@example.test',confirm_account:'b@example.test'},{account:'bad',confirm_account:'bad'},{account:['a@example.test'],confirm_account:'a@example.test'},{account:'a@example.test',confirm_account:'a@example.test',activate:true}])('rejects invalid refresh selection %j',async extra=>{
  expect((await request({passphrase:'fake-owner-passphrase',action:'refresh',...extra})).statusCode).toBe(400);expect(mocks.refresh).not.toHaveBeenCalled();
 });
 it('does not refresh on bad credentials or echo provider errors',async()=>{
  const body={passphrase:'wrong',action:'refresh',account:'a@example.test',confirm_account:'a@example.test'};
  expect((await request(body)).statusCode).toBe(401);expect(mocks.refresh).not.toHaveBeenCalled();
  mocks.refresh.mockRejectedValue(Error('private-refresh-secret'));body.passphrase='fake-owner-passphrase';
  const r=await request(body);expect(r.statusCode).toBe(503);expect(r.body).not.toContain('private-refresh-secret');expect(mocks.inspectGoogleTokenRetirement).not.toHaveBeenCalled();
 });
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

describe('protected token retirement',()=>{
 const action={passphrase:'fake-owner-passphrase',action:'retire',confirmation:'RETIRE PLAINTEXT',deployments_drained:'confirmed',recovery_reviewed:'confirmed'};
 it('requires exact readiness/recovery attestations and owner authentication',async()=>{
  for(const field of ['confirmation','deployments_drained','recovery_reviewed']){
   const body={...action};delete body[field];expect((await request(body)).statusCode).toBe(400);
  }
  expect((await request({...action,passphrase:'wrong'})).statusCode).toBe(401);
  expect((await request(action,{origin:'https://foreign.example.test'})).statusCode).toBe(403);
  expect(mocks.activateGoogleTokenRetirement).not.toHaveBeenCalled();
  const result=await request(action);expect(result.statusCode).toBe(200);
  expect(mocks.activateGoogleTokenRetirement).toHaveBeenCalledExactlyOnceWith({ownerConfirmed:true});
  expect(mocks.refresh.mock.calls).toEqual([['a@example.test'],['b@example.test']]);
  expect(mocks.activateGoogleTokenRetirement.mock.invocationCallOrder[0]).toBeLessThan(mocks.refresh.mock.invocationCallOrder[0]);
  expect(mocks.markLoginAttemptSucceeded.mock.invocationCallOrder.at(-1)).toBeLessThan(mocks.activateGoogleTokenRetirement.mock.invocationCallOrder[0]);
 });
 it('does not claim activation after refused readiness or expose persistence errors',async()=>{
  mocks.activateGoogleTokenRetirement.mockRejectedValue(Error('private database credentials'));
  const result=await request(action);expect(result.statusCode).toBe(503);
  expect(result.body).not.toContain('private database credentials');expect(result.body).not.toContain('storage is active');
 });
});
