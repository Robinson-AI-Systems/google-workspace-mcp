import {describe,it,expect} from 'vitest';
import {normalizeAppCapabilities,inspectAppCapabilities,APP_CAPABILITY_FIELDS}
 from '../../src/tools/dev-integration-capabilities.js';
import {inspectGoogleIntegration,validateIntegrationSpec,tools as integrationTools}
 from '../../src/tools/dev-integration.js';
const account='dev@example.test';
const spec={
 calendarRoles:[{calendarId:'owned-calendar',minimumRole:'writer'}],
 driveFolderCapabilities:[{folderId:'owned-folder',capability:'canAddChildren'}],
 driveMemberships:[{driveId:'owned-shared-drive',permissionId:'owned-member',
  role:'fileOrganizer'}],
 gmailSendAsAliases:['service@example.test']
};
function clients({areas=null,denied=null,wrong=null,missing=null}={}){
 const calls=[];
 const api=(type,response)=>async args=>{
  calls.push({type,args});
  if(type===denied){const e=Error('Sensitive provider note should not escape');e.response={status:403};throw e;}
  if(type===missing){const e=Error('not found');e.response={status:404};throw e;}
  return {data:type===wrong?{...response,id:'unrelated',sendAsEmail:'other@example.test'}:response};
 };
 const c={actingAs:account,rtcPolicy:{profile:'read_only',areas},calendar:{calendarList:{
   get:api('calendar',{id:'owned-calendar',accessRole:'owner'})}},
   drive:{files:{get:api('folder',{id:'owned-folder',
    mimeType:'application/vnd.google-apps.folder',trashed:false,
    capabilities:{canAddChildren:true,canEdit:false,canShare:false,canReadRevisions:true}})},
    permissions:{get:api('membership',{id:'owned-member',type:'user',
     emailAddress:account,role:'fileOrganizer'})}},
   gmail:{users:{settings:{sendAs:{get:api('sendAs',
    {sendAsEmail:'service@example.test',verificationStatus:'accepted'})}}}}};
 return {c,calls};
}
describe('P8-7 app integration read-only capability evidence',()=>{
 it('normalizes four existing-account capability families and no default probes',()=>{
  expect(APP_CAPABILITY_FIELDS).toEqual(['calendarRoles','driveFolderCapabilities',
   'driveMemberships','gmailSendAsAliases']);
  expect(Object.keys(normalizeAppCapabilities({}))).toEqual(APP_CAPABILITY_FIELDS);
  expect(Object.values(normalizeAppCapabilities({})).every(a=>a.length===0)).toBe(true);
  expect(validateIntegrationSpec({apis:[],...spec}).gmailSendAsAliases).toEqual(['service@example.test']);
 });
 it('deduplicates exact roles, folder capabilities and case-insensitive send-as emails',()=>{
  const normalized=normalizeAppCapabilities({
   ...spec,calendarRoles:[spec.calendarRoles[0],spec.calendarRoles[0]],
   gmailSendAsAliases:['Service@Example.test','service@example.test']
  });
  expect(normalized.calendarRoles).toEqual(spec.calendarRoles);
  expect(normalized.gmailSendAsAliases).toEqual(['service@example.test']);
 });
 it('rejects ambiguous roles, resource URL substitutions, flags and excessive requests',()=>{
  const invalid=[
   {calendarRoles:[{calendarId:'owned',minimumRole:'administrator'}]},
   {calendarRoles:[{calendarId:'owned',minimumRole:'writer',confirm:true}]},
   {calendarRoles:[{calendarId:'primary',minimumRole:'full'}]},
   {driveFolderCapabilities:[{folderId:'folder',capability:'owner'}]},
   {driveFolderCapabilities:[{folderId:'https://evil.test',capability:'canEdit'}]},
   {driveMemberships:[{driveId:'d',permissionId:'p'}]},
   {driveMemberships:[{driveId:'d',permissionId:'p',role:'owner'}]},
   {driveMemberships:[{driveId:'d',permissionId:'p',role:'writer',force:true}]},
   {gmailSendAsAliases:['  service@example.test']},
   {gmailSendAsAliases:['https://example.test']},
   {gmailSendAsAliases:[null]},
   {calendarRoles:Array.from({length:13},(_,i)=>({calendarId:'x'+i,minimumRole:'owner'}))},
   {calendarRoles:Array.from({length:7},(_,i)=>({calendarId:'x'+i,minimumRole:'owner'})),
    driveFolderCapabilities:Array.from({length:7},(_,i)=>({folderId:'f'+i,capability:'canEdit'})),
    driveMemberships:Array.from({length:7},(_,i)=>({driveId:'d'+i,permissionId:'p'+i,role:'writer'})),
    gmailSendAsAliases:Array.from({length:7},(_,i)=>'a'+i+'@example.test')}
  ];
  for(const bad of invalid){
   expect(()=>normalizeAppCapabilities(bad),JSON.stringify(bad)).toThrow();
   expect(()=>validateIntegrationSpec({apis:[],...bad})).toThrow();
  }
 });
 it('verifies exact role and capabilities and returns no account resources or bodies',async()=>{
  const {c,calls}=clients();
  const checked=await inspectGoogleIntegration({apis:[],...spec},c);
  expect(checked).toMatchObject({status:'ready',actingAs:account,changesMade:false});
  expect(checked.checks.map(x=>x.kind)).toEqual([
   'calendar_role','drive_folder_capability','drive_membership','gmail_send_as'
  ]);
  expect(checked.checks.every(x=>x.status==='ready')).toBe(true);
  expect(calls).toEqual([
   {type:'calendar',args:{calendarId:'owned-calendar'}},
   {type:'folder',args:{fileId:'owned-folder',
    fields:'id,mimeType,trashed,capabilities(canAddChildren,canEdit,canShare,canReadRevisions)',
    supportsAllDrives:true}},
   {type:'membership',args:{fileId:'owned-shared-drive',permissionId:'owned-member',
    fields:'id,role,emailAddress,type',supportsAllDrives:true}},
   {type:'sendAs',args:{userId:'me',sendAsEmail:'service@example.test'}}
  ]);
  expect(checked.checks.every(x=>!('data' in x)&&!('emailAddress' in x))).toBe(true);
 });
 it('returns missing when role is lower, folder capability is false and sender is unverified',async()=>{
  const {c}=clients();
  c.calendar.calendarList.get=async()=>({data:{id:'owned-calendar',accessRole:'reader'}});
  c.drive.files.get=async()=>({data:{id:'owned-folder',
    mimeType:'application/vnd.google-apps.folder',trashed:false,
    capabilities:{canAddChildren:false}}});
  c.drive.permissions.get=async()=>({data:{id:'owned-member',
    emailAddress:account,role:'reader'}});
  c.gmail.users.settings.sendAs.get=async()=>({data:{sendAsEmail:'service@example.test',
    verificationStatus:'pending'}});
  const response=await inspectGoogleIntegration({apis:[],...spec},c);
  expect(response.status).toBe('missing');
  expect(response.checks).toHaveLength(4);
  expect(response.checks.every(x=>x.status==='missing'&&
    x.reason==='required_capability_not_available')).toBe(true);
 });
 it('does not claim readiness for wrong object, mailbox, missing role or capability value',async()=>{
  for(const key of ['calendar','folder','membership','sendAs']){
   const {c}=clients({wrong:key});
   const response=await inspectGoogleIntegration({apis:[],...spec},c);
   expect(response.status,key).toBe('not_readable');
   expect(response.checks.filter(x=>x.status==='not_readable'),key).toHaveLength(1);
  }
  const {c}=clients();
  c.calendar.calendarList.get=async()=>({data:{id:'owned-calendar'}});
  c.drive.files.get=async()=>({data:{id:'owned-folder',
   mimeType:'application/vnd.google-apps.folder',trashed:false,capabilities:{}}});
  c.drive.permissions.get=async()=>({data:{id:'owned-member',
   emailAddress:account,role:'unknown'}});
  c.gmail.users.settings.sendAs.get=async()=>({data:{sendAsEmail:'service@example.test'}});
  const result=await inspectAppCapabilities(normalizeAppCapabilities(spec),c);
  expect(result).toHaveLength(4);
  expect(result.every(x=>x.status==='not_readable')).toBe(true);
 });
 it('classifies 404 as missing and 403 as unreadable without leaking errors',async()=>{
  const denied=clients({denied:'folder'});
  const deniedResult=await inspectGoogleIntegration({apis:[],...spec},denied.c);
  expect(deniedResult.status).toBe('not_readable');
  expect(deniedResult.checks.find(x=>x.kind==='drive_folder_capability')).toMatchObject({
   status:'not_readable',reason:'scope_or_access_denied'
  });
  expect(JSON.stringify(deniedResult)).not.toContain('Sensitive provider note');
  const missing=clients({missing:'calendar'});
  const missingResult=await inspectGoogleIntegration({apis:[],...spec},missing.c);
  expect(missingResult.status).toBe('missing');
  expect(missingResult.checks.find(x=>x.kind==='calendar_role')).toMatchObject({
   status:'missing',reason:'resource_not_found'
  });
 });
 it('checks all permission areas before making any Google call',async()=>{
  const {c,calls}=clients({areas:['mail']});
  const result=await inspectGoogleIntegration({apis:[],...spec},c);
  expect(result.status).toBe('not_readable');
  expect(result.checks.filter(x=>x.reason==='connection_area_excluded')).toHaveLength(3);
  expect(calls.map(x=>x.type)).toEqual(['sendAs']);
 });
 it('Gmail primary send-as alias is readable even without a verification status',async()=>{
  const {c}=clients();
  c.gmail.users.settings.sendAs.get=async()=>({data:{sendAsEmail:'service@example.test',isPrimary:true}});
  const result=await inspectGoogleIntegration({apis:[],gmailSendAsAliases:['service@example.test']},c);
  expect(result.status).toBe('ready');
 });
 it('public input schema includes exact access requirements and bounded arrays',()=>{
  const fields=integrationTools[0].inputSchema.properties.spec.properties;
  for(const field of APP_CAPABILITY_FIELDS){
   expect(fields[field].type).toBe('array');
   expect(fields[field].maxItems).toBe(12);
  }
  expect(fields.calendarRoles.items.required).toEqual(['calendarId','minimumRole']);
  expect(fields.driveFolderCapabilities.items.required).toEqual(['folderId','capability']);
  expect(fields.driveMemberships.items.required).toEqual(['driveId','permissionId','role']);
 });
});
