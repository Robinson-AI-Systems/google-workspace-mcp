import {describe,it,expect} from 'vitest';
import {configuration,capabilities,dashboardUrl,installCrossSiteForms,waitForPilot,run} from '../../scripts/v1-browserstack-csrf.mjs';
import {crossSiteDocument,ORIGIN,REMOTE_FORM_ORIGIN} from '../../scripts/v1-live-csrf-browser.mjs';
import {readFileSync} from 'node:fs';
const env={BROWSERSTACK_USERNAME:'private-user-fixture',BROWSERSTACK_ACCESS_KEY:'private-key-fixture',BROWSERSTACK_INCLUDED_USAGE_CONFIRMED:'true'};
const sha='a'.repeat(40);
describe('BrowserStack acceptance controller, synthetic adapters only',()=>{
 it('requires explicit included-usage approval, a pinned source and only known modes',()=>{
  const args=['--expected-live',sha,'--mode','capability'];
  expect(configuration(args,env)).toEqual({expectedSha:sha,mode:'capability'});
  expect(()=>configuration(args,{...env,BROWSERSTACK_INCLUDED_USAGE_CONFIRMED:'false'})).toThrow('included_usage_confirmation_required');
  expect(()=>configuration(args,{...env,BROWSERSTACK_ACCESS_KEY:''})).toThrow('browserstack_secrets_missing');
  expect(()=>configuration(['--expected-live',sha,'--mode','attach'],env)).toThrow();
 });
 it('disables payload/protocol/console/screenshot logging and enables required manual takeover settings',()=>{
  const caps=capabilities(env,'Primary','1.62.1');
  for(const key of ['browserstack.debug','browserstack.networkLogs','browserstack.playwrightLogs'])expect(caps[key]).toBe(false);
  expect(caps['browserstack.console']).toBe('disable');expect(caps['browserstack.video']).toBe(true);
  expect(caps['browserstack.interactiveDebugging']).toBe(true);
 });
 it('constructs authenticated dashboard links and discards all provider-returned token URLs',()=>{
  const url=dashboardUrl({build_hashed_id:'build123',hashed_id:'session123',public_url:'https://evil.test/?auth_token=private',video_url:'private'});
  expect(url).toBe('https://automate.browserstack.com/builds/build123/sessions/session123');
  expect(()=>dashboardUrl({build_hashed_id:'build123',hashed_id:'session123?token=private'})).toThrow();
 });
 it('intercepts only the separate reserved origin; real application requests remain untouched',async()=>{
  let pattern,handler;await installCrossSiteForms({route:async(p,h)=>{pattern=p;handler=h;}});
  expect(pattern).toBe(REMOTE_FORM_ORIGIN+'/**');expect(pattern).not.toContain(ORIGIN);
  for(const [path,method,status]of [['/preview/wrong','GET',200],['/preview/wrong?target=private','GET',404],['/logout/missing','POST',404]]){
   let result;await handler({request:()=>({url:()=>REMOTE_FORM_ORIGIN+path,method:()=>method}),fulfill:async r=>{result=r;}});
   expect(result.status).toBe(status);
   if(status===200){expect(result.body).toContain('value="delete_preview"');expect(result.body).not.toContain('request_delete');}
  }
  expect(crossSiteDocument('/preview/wrong?target=private')).toBeNull();
 });
 it('rejects a different signed-in account and has a bounded login wait',async()=>{
  const row={email:'expected@example.test',context:{request:{get:async()=>({status:()=>200,text:async()=>'<html>different@example.test</html>'})}}};
  await expect(waitForPilot(row)).rejects.toThrow('wrong_pilot_identity');
  let n=0;
  row.context.request.get=async()=>({status:()=>401});
  await expect(waitForPilot(row,{timeoutMs:2,now:()=>n++,pause:async()=>{}})).rejects.toThrow('interactive_login_timeout');
 });
 it('never emits the credential-bearing connection error or provider URL',async()=>{
  const emitted=[];
  const result=await run({config:{mode:'capability',expectedSha:sha},env,version:'1.62.1',chromium:{connect:async()=>{throw new Error('Failed URL wss://example?key='+env.BROWSERSTACK_ACCESS_KEY);}},emit:x=>emitted.push(x)});
  expect(result.result).toBe('INCOMPLETE');expect(result.reason).toBe('remote_operation_failed');
  expect(emitted.join('')).not.toContain(env.BROWSERSTACK_ACCESS_KEY);
  const plain=await run({config:{mode:'capability',expectedSha:sha},env,version:'1.62.1',chromium:{connect:async()=>{throw new Error('secretletters');}},emit:x=>emitted.push(x)});
  expect(plain.reason).toBe('remote_operation_failed');expect(emitted.join('')).not.toContain('secretletters');
 });
 it('cleans a newly created session and closes the browser when interactive login fails',async()=>{
  let closed=0,portalVisits=0;const emitted=[];
  const page={goto:async()=>{portalVisits++;return {status:()=>401};},evaluate:async()=>JSON.stringify({build_hashed_id:'build123',hashed_id:'session123'}),
   title:async()=>'',getByRole:()=>({click:async()=>{}})};
  const context={setDefaultTimeout:()=>{},route:async()=>{},newPage:async()=>page,request:{get:async url=>({status:()=>url.endsWith('/api/contract')?200:401,json:async()=>({deployment:{sourceRevision:sha}})})}};
  const browser={newContext:async()=>context,close:async()=>{closed++;}};
  const result=await run({config:{mode:'csrf',expectedSha:sha},env,version:'1.62.1',chromium:{connect:async()=>browser},emit:x=>emitted.push(x),waitForPilotFn:async()=>{throw new Error('interactive_login_timeout');}});
  expect(result.result).toBe('INCOMPLETE');expect(closed).toBe(1);expect(portalVisits).toBe(2);
  expect(emitted.join('')).toContain('already_anonymous');expect(emitted.join('')).not.toContain(env.BROWSERSTACK_ACCESS_KEY);
 });
 it('requires owner and rerun-owner checks before credentials and bounds the one authorized automatic run',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/browserstack-csrf.yml',import.meta.url),'utf8');
  expect(workflow).toContain("github.event_name == 'workflow_dispatch' && inputs.included_usage_confirmed");
  expect(workflow).toContain('github.event.workflow_run.id == 39458157168');
  expect(workflow).toContain('github.event.workflow_run.run_attempt == 2');
  expect(workflow).toContain("github.event.workflow_run.conclusion == 'success'");
  expect(workflow).not.toContain('pull_request:');expect(workflow).not.toContain('upload-artifact');
  const guard=workflow.slice(0,workflow.indexOf('BROWSERSTACK_USERNAME: ${{ secrets.'));
  for(const actor of ['ACTOR','TRIGGERING_ACTOR'])expect(guard).toContain('test "$'+actor+'" = christcr2012');
  expect(guard).toContain('test "$REF" = refs/heads/main');
 });
});
