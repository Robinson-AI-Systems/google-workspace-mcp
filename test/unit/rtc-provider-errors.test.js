import {describe,it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({handler:vi.fn()}));
vi.mock('../../src/tools/index.js',()=>({registry:{tools:[{name:'gmail_get_message',description:'Read one message',inputSchema:{type:'object'}}],handlers:{gmail_get_message:(...a)=>m.handler(...a)}}}));
vi.mock('../../src/db.js',()=>({initSchema:vi.fn(),getRtcPass:async()=>({id:'pass_fake',google_account:'ops@example.test',profile:'read_only',mode:'test',areas:['mail'],allow_writes:false,rate_limit_per_minute:120}),rtcPassFailureCode:vi.fn(),chargeRtcPass:async()=>true,getAllowedDomains:async()=>[],storeRtcResult:vi.fn(),getRtcResult:vi.fn()}));
vi.mock('../../src/auth/google-auth-hosted.js',()=>({buildHostedApiClients:async()=>({actingAs:'ops@example.test'})}));
import {errorResult} from '../../src/tools/util.js';
const {createRtcGateway}=await import('../../api/rtc-gateway.js');
async function request(){const r={headers:{}};r.setHeader=(k,v)=>r.headers[k]=v;r.status=n=>(r.statusCode=n,r);r.json=b=>(r.body=b,r);await createRtcGateway()({method:'POST',headers:{authorization:'Bearer rtc_pass_'+ 'a'.repeat(43)},query:{tool:'workspace_gmail_get_message'},body:{messageId:'fake-missing'}},r);return r;}
beforeEach(()=>vi.resetAllMocks());
describe('real-provider-shaped missing-resource classification',()=>{
 it.each([{code:404},{response:{status:404}}])('preserves wrapped Google404 independently of plain-English rendering %j',async shape=>{
  const rendered=errorResult(Object.assign(Error('fake resource missing'),shape));
  expect(rendered._meta).toEqual({'robinson/error-code':'not_found'});expect(rendered.isError).toBe(true);
  m.handler.mockResolvedValue(rendered);const r=await request();expect(r.statusCode).toBe(404);expect(r.body.error.code).toBe('not_found');
 });
 it.each([401,403,429])('preserves wrapped provider%d through both supported error shapes',async status=>{
  for(const shape of [{code:status},{response:{status}}]){
   const rendered=errorResult(Object.assign(Error('fake provider denial'),shape));
   expect(rendered._meta).toEqual({'robinson/error-code':status===429?'rate_limited':'permission','robinson/provider-status':status});
   m.handler.mockResolvedValue(rendered);const r=await request();expect(r.statusCode).toBe(status);
   expect(r.body.error.code).toBe(status===429?'rate_limited':'permission');
  }
 });
 it('refuses incomplete or contradictory provider status markers',async()=>{
  for(const meta of [
   {'robinson/error-code':'permission'},
   {'robinson/error-code':'permission','robinson/provider-status':500},
   {'robinson/error-code':'rate_limited','robinson/provider-status':403}
  ]){m.handler.mockResolvedValue({isError:true,content:[{type:'text',text:'Unknown provider error'}],_meta:meta});expect((await request()).statusCode).toBe(503);}
 });
 it('classifies a raw thrown Google404 without exposing provider messages',async()=>{
  m.handler.mockRejectedValue(Object.assign(Error('fake-private-provider-detail'),{response:{status:404}}));const r=await request();
  expect(r.statusCode).toBe(404);expect(r.body.error.code).toBe('not_found');expect(JSON.stringify(r.body)).not.toContain('fake-private-provider-detail');
 });
 it('does not infer404 from wording or turn uncertain failures into missing resources',async()=>{
  const rendered=errorResult(Error('not found in an unknown failure'));expect(rendered._meta).toBeUndefined();
  m.handler.mockResolvedValue(rendered);expect((await request()).body.error.code).toBe('service_error');
  m.handler.mockRejectedValue(Object.assign(Error('upstream unavailable'),{code:503}));expect((await request()).statusCode).toBe(503);
 });
 it.each([[401,401,'permission'],[403,403,'permission'],[429,429,'rate_limited']])('preserves raw provider%d as HTTP%d',async(code,status,kind)=>{
  m.handler.mockRejectedValue(Object.assign(Error('fake provider error'),{code}));const r=await request();expect(r.statusCode).toBe(status);expect(r.body.error.code).toBe(kind);
 });
});
