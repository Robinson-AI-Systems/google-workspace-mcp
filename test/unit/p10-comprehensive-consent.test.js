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
  const invalid={response:{status:400,data:{error:{message:'Invalid task list ID'}}}};
  expect(classifyFailure(invalid)).toEqual({status:'missing',reason:'invalid_provider_resource'});
 });
});

describe('Readable result and recoverable Drive safety for the new consent rollout',()=>{
 it('a valid empty Google Doc has an explicit empty marker, not an indistinguishable empty MCP output',async()=>{
  const {handlers}=await import('../../src/tools/docs.js');
  const docs={documents:{get:async()=>({data:{documentId:'test-doc',body:{content:[]}}})}};
  const out=await handlers.docs_get_text({documentId:'test-doc'},{docs});
  expect(JSON.parse(out.content[0].text)).toEqual({documentId:'test-doc',text:'',empty:true});
  docs.documents.get=async()=>({data:{documentId:'test-doc',body:{content:[{paragraph:{elements:[{textRun:{content:'Hi'}}]}}]}}});
  const nonempty=await handlers.docs_get_text({documentId:'test-doc'},{docs});
  expect(JSON.parse(nonempty.content[0].text)).toMatchObject({text:'Hi',empty:false});
 });
 it('trash uses recoverable Google Drive update and remains guarded by explicit confirmation',async()=>{
  const {GUARDS}=await import('../../src/tools/guards.js');
  const {registry}=await import('../../src/tools/index.js');
  const tool=registry.tools.find(t=>t.name==='drive_trash_file');
  expect(GUARDS.drive_trash_file.destructive).toBe(true);
  expect(tool.inputSchema.properties).toHaveProperty('confirm');
  expect(tool.inputSchema.properties).toHaveProperty('dryRun');
  expect(tool.name).toBe('drive_trash_file');
  const dryClient={drive:{files:{
   get:async()=>({data:{id:'temporary-folder',name:'Scratch',trashed:false}}),
   update:async()=>{throw Error('a preview must not mutate Google');}
  }},store:{recordChange:async()=>({logged:true,id:1})}};
  const preview=await registry.handlers.drive_trash_file({fileId:'temporary-folder',dryRun:true},dryClient);
  expect(JSON.parse(preview.content[0].text)).toMatchObject({done:false,dryRun:true});
 });
});


describe('Bounded real-provider creation and lookup responses',()=>{
 it('does not return huge Slides provider creates in a change receipt',async()=>{
  const {handlers}=await import('../../src/tools/slides.js');
  const fakeSlide={presentationId:'temporary-presentation',title:'Pilot scratch',
    slides:[{note:'sensitive detail '.repeat(25000)}]};
  const slides={presentations:{create:async()=>({data:fakeSlide})}};
  const result=await handlers.slides_create_presentation({title:'Pilot scratch'},{slides});
  expect(JSON.parse(result.content[0].text)).toEqual({
    presentationId:'temporary-presentation',title:'Pilot scratch'});
  expect(result.content[0].text.length).toBeLessThan(500);
 });
 it('keeps Drive list pagination and essentials but omits long default owner/avatar/link fields',async()=>{
  const {handlers}=await import('../../src/tools/drive.js');
  let called;
  const drive={files:{list:async args=>{
    called=args;return {data:{nextPageToken:'more',files:[{id:'folder',name:'Scratch'}]}};
  }}};
  const result=await handlers.drive_list_files({maxResults:10},{drive});
  const data=JSON.parse(result.content[0].text);
  expect(data.nextPageToken).toBe('more');
  expect(data.files[0].id).toBe('folder');
  expect(called.pageSize).toBe(10);
  expect(called.fields).toContain('nextPageToken');
  expect(called.fields).not.toMatch(/owners|webViewLink/);
 });
});
