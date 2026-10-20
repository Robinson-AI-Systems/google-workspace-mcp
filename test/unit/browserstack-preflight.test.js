import {describe,it,expect} from 'vitest';
import {probe,PLAN_URL} from '../../scripts/browserstack-preflight.mjs';
import {readFileSync} from 'node:fs';
const response=(status,body,headers={})=>({status,text:async()=>body,headers:new Headers(headers)});
describe('BrowserStack preflight has no session or secret side effects',()=>{
 it('guards the original actor and rerun initiator before any credential-backed step',()=>{
  const workflow=readFileSync(new URL('../../.github/workflows/browserstack-preflight.yml',import.meta.url),'utf8');
  const gate=workflow.indexOf('Require the owner and reviewed main');
  const secret=workflow.indexOf('BROWSERSTACK_USERNAME: ${{ secrets.');
  expect(gate).toBeGreaterThan(0);expect(secret).toBeGreaterThan(gate);
  const guard=workflow.slice(gate,secret);
  for(const actor of ['ACTOR','TRIGGERING_ACTOR'])expect(guard).toContain('test "$'+actor+'" = christcr2012');
  expect(guard).toContain('TRIGGERING_ACTOR: ${{ github.triggering_actor }}');
  expect(guard).toContain('test "$REF" = refs/heads/main');
 });
 it('proves a real authentication challenge without requiring credentials',async()=>{
  let call;
  const result=await probe({fetcher:async(...args)=>{call=args;return response(401,'Unauthorized',{'www-authenticate':'Basic realm="BrowserStack"'});}});
  expect(result.result).toBe('PASS_NETWORK_ONLY');
  expect(call[0]).toBe(PLAN_URL);expect(call[1].method).toBe('GET');
  expect(call[1].redirect).toBe('manual');expect(call[1].headers.authorization).toBeUndefined();
 });
 it('does not mistake the observed HTTP200 HTML interstitial for a provider pass',async()=>{
  expect((await probe({fetcher:async()=>response(200,'<title>Site Unavailable</title>')})).reason).toBe('site_unavailable_interstitial');
 });
 it('keeps credentials, unexpected response fields and exception messages out of reports',async()=>{
  const secret='private-fixture-password';let call;
  const result=await probe({username:'private-fixture-user',key:secret,fetcher:async(...args)=>{
   call=args;return response(200,JSON.stringify({parallel_sessions_max_allowed:1,parallel_sessions_running:0,extra:secret}));
  }});
  expect(result.result).toBe('PASS_ACCOUNT_READ_ONLY');expect(result.sessionStarted).toBe(false);
  expect(result.includedFreeEntitlement).toBe('NOT_VERIFIED');
  expect(JSON.stringify(result)).not.toContain('private-fixture');expect(result.capacity).toEqual({parallel_sessions_max_allowed:1,parallel_sessions_running:0});
  expect(call[1].headers.authorization).toBe('Basic '+Buffer.from('private-fixture-user:'+secret).toString('base64'));
  expect(await probe({fetcher:async()=>{throw new Error(secret);}})).toMatchObject({reason:'network_request_failed',result:'INCOMPLETE'});
 });
 it('fails closed for missing credential pairs, redirects, bad JSON and unknown plans',async()=>{
  let calls=0;const fetcher=async()=>{calls++;return response(200,'{}');};
  expect((await probe({fetcher,username:'u'})).reason).toBe('credential_pair_incomplete');expect(calls).toBe(0);
  for(const [status,body,reason]of [[302,'','provider_http_refusal'],[401,'','credentials_not_accepted'],[200,'HTML','provider_response_not_json'],[200,'{}','unrecognized_plan_response']]){
   expect((await probe({username:'u',key:'k',fetcher:async()=>response(status,body)})).reason).toBe(reason);
  }
 });
});
