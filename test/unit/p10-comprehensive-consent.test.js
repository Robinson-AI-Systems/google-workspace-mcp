import {describe,it,expect} from 'vitest';
import {PUBLIC_SCOPE_GROUPS,providerUrl} from '../../src/principals/google.js';
import {classifyFailure} from '../../src/tools/dev-integration.js';

describe('P10 full direct-user Google scope consent',()=>{
 it('offers all implemented direct-user API families together, once each, without robot delegation',()=>{
  const all=new Set(PUBLIC_SCOPE_GROUPS.complete);
  expect(all.size).toBe(PUBLIC_SCOPE_GROUPS.complete.length);
  for(const [name,scopes] of Object.entries(PUBLIC_SCOPE_GROUPS)){
   expect(scopes.length).toBeGreaterThan(0);
   if(name!=='complete')for(const value of scopes)expect(all.has(value)).toBe(true);
  }
  for(const suffix of ['tasks','chat.spaces','admin.directory.group',
    'admin.reports.audit.readonly','apps.licensing','ediscovery.readonly',
    'siteverification','postmaster.traffic.readonly',
    'chrome.management.policy.readonly','cloud-identity.policies.readonly'])
   expect(all.has('https://www.googleapis.com/auth/'+suffix)).toBe(true);
  expect([...all].some(s=>s.endsWith('/apps.alerts'))).toBe(false);
 });
 it('Google makes the permission decision in ONE one-use PKCE protected interactive request',()=>{
  let o;
  const client={generateAuthUrl:opts=>(o=opts,'https://accounts.google.com/consent')};
  const result=providerUrl({client,state:'state',nonce:'nonce',verifier:'verifier',group:'complete'});
  expect(result).toBe('https://accounts.google.com/consent');
  expect(o.scope).toEqual(['openid','email','profile',...PUBLIC_SCOPE_GROUPS.complete]);
  expect(o).toMatchObject({access_type:'offline',include_granted_scopes:true,
    prompt:'consent',code_challenge_method:'S256'});
 });
 it('never confuses disabled provider API, missing Google consent and unrelated refusal',()=>{
  const provider=(reason,message)=>({response:{status:403,data:{error:{message,errors:[{reason}]}}}});
  expect(classifyFailure(provider('insufficientPermissions','Request had insufficient authentication scopes.')))
   .toEqual({status:'not_readable',reason:'oauth_consent_missing'});
  expect(classifyFailure(provider('forbidden','Google Drive API has not been used in project 100 before or is disabled.')))
   .toEqual({status:'missing',reason:'api_not_enabled'});
  expect(classifyFailure(provider('forbidden','Workspace administrator permission required')))
   .toEqual({status:'not_readable',reason:'scope_or_access_denied'});
 });
});
