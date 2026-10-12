import {describe,it,expect,vi} from 'vitest';
import {validateRtcOrigin,chooseReadTool,main} from '../../scripts/rtc-live-probe.mjs';
describe('opt-in RTC direct proof guardrails',()=>{
 it('refuses non-HTTPS origins, embedded secrets and paths',()=>{
  expect(validateRtcOrigin('https://rtc.example.test')).toBe('https://rtc.example.test');
  for(const url of ['http://rtc.example.test','https://user:pass@rtc.example.test','https://rtc.example.test/path','https://rtc.example.test/?secret=abc'])expect(()=>validateRtcOrigin(url)).toThrow();
 });
 it('selects only advertised read tools',()=>{
  const tools=[{name:'workspace_safe_read',writes:false,annotations:{readOnlyHint:true}},{name:'workspace_write',writes:true,annotations:{readOnlyHint:false}}];
  expect(chooseReadTool(tools,'workspace_safe_read').name).toBe('workspace_safe_read');
  expect(()=>chooseReadTool(tools,'workspace_write')).toThrow();
  expect(()=>chooseReadTool(tools,'invented')).toThrow();
 });
 it('refuses invocation without explicit authorization and protected secret names',async()=>{
  const error=vi.spyOn(console,'error').mockImplementation(()=>{});
  expect(await main([],{})).toBe(2);
  expect(await main(['--authorized-read-only'],{RTC_ORIGIN:'https://rtc.example.test'})).toBe(2);
  error.mockRestore();
 });
});
