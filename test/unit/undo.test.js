import {describe,it,expect,vi,beforeEach} from 'vitest';
const db=vi.hoisted(()=>({getOwnedChange:vi.fn(),recordChange:vi.fn()}));
vi.mock('../../src/db.js',()=>db);
import {prepareUndo,handlers} from '../../src/tools/undo.js';
import {toolMetadata} from '../../src/rtc/catalog.js';
import {tools} from '../../src/tools/undo.js';
import {SETTING_KEYS} from '../../src/tools/group-settings.js';
const before={name:'old',labelListVisibility:'labelShow',messageListVisibility:'show'};
const after={...before,name:'new'};
let entry,c,state,writes,logs;
const unpack=r=>JSON.parse(r.content[0].text);
beforeEach(()=>{
 entry={id:1,acting_as:'owner@example.test',connection:'conn',tool:'gmail_update_label',target:'Label_1',before,after,dry_run:false};
 state={...after};writes=[];logs=[];
 c={actingAs:entry.acting_as,connection:'conn',rtcPolicy:{profile:'full'},gmail:{users:{labels:{
 get:vi.fn(async()=>({data:{...state}})),patch:vi.fn(async request=>{writes.push(request);state={...request.requestBody};})}}}};
 db.getOwnedChange.mockReset().mockImplementation(async()=>entry);
 db.recordChange.mockReset().mockImplementation(async log=>{logs.push(log);return 2;});
});
describe('safe log undo',()=>{
 it('previews and requests confirmation without mutating',async()=>{
  expect(unpack(await handlers.workspace_undo_change({changeId:1,dryRun:true},c))).toMatchObject({done:false,dryRun:true});
  expect(unpack(await handlers.workspace_undo_change({changeId:1},c)).needsConfirmation).toBe(true);
  expect(writes).toEqual([]);expect(logs[0].dryRun).toBe(true);
 });
 it('restores only reviewed fields, reads back, logs, and supports undoing the undo',async()=>{
  const r=unpack(await handlers.workspace_undo_change({changeId:1,confirm:true},c));
  expect(r).toMatchObject({done:true,confirmed:true,logged:true,after:{kind:'gmail_label',target:'Label_1',state:before}});
  expect(writes[0]).toEqual({userId:'me',id:'Label_1',requestBody:before});
  entry={...entry,id:2,tool:'workspace_undo_change',before:logs[0].before,after:logs[0].after};
  expect(unpack(await handlers.workspace_undo_change({changeId:2,confirm:true},c)).confirmed).toBe(true);
  expect(state).toEqual(after);
 });
 it.each(['acting_as','connection'])('refuses foreign %s before provider access',async key=>{
  entry[key]='foreign';await expect(prepareUndo({changeId:1},c)).rejects.toThrow('not found');expect(c.gmail.users.labels.get).not.toHaveBeenCalled();
 });
 it.each(['gmail_send_email','drive_delete_file','admin_sign_out_user','arbitrary_tool'])('refuses irreversible or unknown %s',async tool=>{
  entry.tool=tool;await expect(prepareUndo({changeId:1},c)).rejects.toThrow('cannot be safely undone');expect(writes).toHaveLength(0);
 });
 it.each([{profile:'read_only'},{profile:'everyday'},{profile:'full',areas:['workspace']}])('refuses restricted policy %j',async policy=>{
  c.rtcPolicy=policy;await expect(prepareUndo({changeId:1},c)).rejects.toThrow('outside_scope');expect(c.gmail.users.labels.get).not.toHaveBeenCalled();
 });
 it('refuses previews, missing snapshots, redaction and system labels',async()=>{
  entry.dry_run=true;await expect(prepareUndo({changeId:1},c)).rejects.toThrow('preview');entry.dry_run=false;
  entry.before={name:'old'};await expect(prepareUndo({changeId:1},c)).rejects.toThrow('complete');
  entry.before={...before,name:'[2001 characters not stored]'};await expect(prepareUndo({changeId:1},c)).rejects.toThrow('shortened');
  entry.before=before;entry.target='INBOX';await expect(prepareUndo({changeId:1},c)).rejects.toThrow('target');
 });
 it('refuses current-state drift and a change between preview and apply',async()=>{
  state.name='third';await expect(handlers.workspace_undo_change({changeId:1,confirm:true},c)).rejects.toThrow('changed since');
  state={...after};c.gmail.users.labels.get.mockResolvedValueOnce({data:after}).mockResolvedValueOnce({data:{...after,name:'third'}});
  await expect(handlers.workspace_undo_change({changeId:1,confirm:true},c)).rejects.toThrow('changed since');expect(writes).toHaveLength(0);
 });
 it('reports read-back mismatch and audit failure without verified success',async()=>{
  c.gmail.users.labels.patch.mockImplementation(async()=>{});
  expect(unpack(await handlers.workspace_undo_change({changeId:1,confirm:true},c)).confirmed).toBe(false);
  db.recordChange.mockRejectedValueOnce(Error('offline'));
  expect(unpack(await handlers.workspace_undo_change({changeId:1,confirm:true},c))).toMatchObject({confirmed:false,auditFailure:true});
 });
 it.each([
  ['gmail_update_imap_settings','IMAP access','getImap','updateImap',{enabled:false,autoExpunge:true,expungeBehavior:'archive',maxFolderSize:0},{enabled:true,autoExpunge:true,expungeBehavior:'archive',maxFolderSize:0}],
  ['gmail_update_pop_settings','POP access','getPop','updatePop',{accessWindow:'disabled',disposition:'leaveInInbox'},{accessWindow:'allMail',disposition:'leaveInInbox'}]
 ])('restores complete settings for %s',async(tool,target,get,update,b,a)=>{
  entry={...entry,tool,target,before:b,after:a};state=a;
  c.gmail.users.settings={[get]:async()=>({data:state}),[update]:async r=>{state=r.requestBody;}};
  expect(unpack(await handlers.workspace_undo_change({changeId:1,confirm:true},c)).confirmed).toBe(true);expect(state).toEqual(b);
 });
 it('advertises mutation and mandatory confirmation accurately',()=>{
  expect(toolMetadata(tools[0])).toMatchObject({writes:true,destructive:true,annotations:{readOnlyHint:false,destructiveHint:true}});
 });
 it.each([
  ['drive_rename_file','file_123','drive','files',{id:'file_123',name:'old',mimeType:'text/plain'},{id:'file_123',name:'new',mimeType:'text/plain'},{name:'old'}],
  ['drive_star_file','file_123','drive','files',{id:'file_123',name:'doc',starred:false},{id:'file_123',name:'doc',starred:true},{starred:false}],
  ['drive_unstar_file','file_123','drive','files',{id:'file_123',name:'doc',starred:true},{id:'file_123',name:'doc',starred:false},{starred:true}],
  ['calendar_update_calendar','primary','calendar','calendars',{id:'cal@example.test',summary:'old',timeZone:'America/Denver'},{id:'cal@example.test',summary:'new',timeZone:'America/Denver',description:'new desc',location:'room'},{summary:'old',timeZone:'America/Denver',description:'',location:''}]
 ])('restores %s without changing file contents, sharing or guests',async(tool,target,service,resource,b,a,body)=>{
  entry={...entry,tool,target,before:b,after:a};state=a;let request;
  c[service]={[resource]:{get:async()=>({data:state}),[service==='drive'?'update':'patch']:async r=>{request=r;state={...state,...r.requestBody};}}};
  expect(unpack(await handlers.workspace_undo_change({changeId:1,confirm:true},c)).confirmed).toBe(true);
  expect(request.requestBody).toEqual(body);
  expect(request[service==='drive'?'fileId':'calendarId']).toBe(b.id);
  entry={...entry,id:2,tool:'workspace_undo_change',before:logs[0].before,after:logs[0].after};
  expect(unpack(await handlers.workspace_undo_change({changeId:2,confirm:true},c)).confirmed).toBe(true);
 });
 it('refuses inconsistent provider IDs and lossy calendar text',async()=>{
  entry={...entry,tool:'drive_rename_file',target:'file_123',before:{id:'wrong',name:'old',mimeType:'text/plain'},after:{id:'file_123',name:'new',mimeType:'text/plain'}};
  await expect(prepareUndo({changeId:1},c)).rejects.toThrow('IDs');
  entry={...entry,tool:'calendar_update_calendar',before:{id:'cal',summary:'old',timeZone:'UTC',description:'[2001 characters not stored]'},after:{id:'cal',summary:'new',timeZone:'UTC'}};
  await expect(prepareUndo({changeId:1},c)).rejects.toThrow('shortened');
 });

 it.each([['admin_add_user_alias','users',[],['alias@example.test']],['admin_delete_user_alias','users',['alias@example.test'],[]],['admin_add_group_alias','groups',[],['alias@example.test']],['admin_delete_group_alias','groups',['alias@example.test'],[]]])('restores exact alias for %s and undo-of-undo',async(tool,resource,b,a)=>{
  entry={...entry,tool,target:'alias@example.test on parent@example.test',before:{aliases:b},after:{aliases:a}};state={aliases:a};
  c.allowedDomains=['example.test'];let request;
  c.admin={[resource]:{aliases:{list:async()=>({data:{aliases:state.aliases.map(alias=>({alias}))}}),
   insert:async r=>{request=r;state={aliases:[...state.aliases,r.requestBody.alias]};},delete:async r=>{request=r;state={aliases:state.aliases.filter(x=>x!==r.alias)};}}}};
  expect(unpack(await handlers.workspace_undo_change({changeId:1,confirm:true},c)).confirmed).toBe(true);expect(state.aliases).toEqual(b);
  expect(request[resource==='users'?'userKey':'groupKey']).toBe('parent@example.test');
  entry={...entry,id:2,tool:'workspace_undo_change',before:logs[0].before,after:logs[0].after};
  expect(unpack(await handlers.workspace_undo_change({changeId:2,confirm:true},c)).confirmed).toBe(true);expect(state.aliases).toEqual(a);
 });
 it('refuses foreign alias domains, multi-alias changes and capped lists before writes',async()=>{
  entry={...entry,tool:'admin_add_user_alias',target:'alias@foreign.test on parent@example.test',before:{aliases:[]},after:{aliases:['alias@foreign.test']}};c.allowedDomains=['example.test'];
  await expect(prepareUndo({changeId:1},c)).rejects.toThrow('outside_scope');
  entry.target='alias@example.test on parent@example.test';entry.after={aliases:['alias@example.test','other@example.test']};
  await expect(prepareUndo({changeId:1},c)).rejects.toThrow('single reversible');
  entry.before={aliases:Array.from({length:100},(_,i)=>'a'+i+'@example.test')};
  await expect(prepareUndo({changeId:1},c)).rejects.toThrow('untruncated');
 });
 it('restores complete reviewed group settings, refusing missing fields and outside domains',async()=>{
  const b=Object.fromEntries(SETTING_KEYS.map(k=>[k,'old'])),a={...b,whoCanJoin:'ANYONE_CAN_JOIN'};
  entry={...entry,tool:'admin_update_group_settings',target:'group@example.test',before:b,after:a};state=a;c.allowedDomains=['example.test'];
  c.groupssettings={groups:{get:async()=>({data:state}),patch:async r=>{expect(Object.keys(r.requestBody).sort()).toEqual([...SETTING_KEYS].sort());state=r.requestBody;}}};
  expect(unpack(await handlers.workspace_undo_change({changeId:1,confirm:true},c)).confirmed).toBe(true);expect(state).toEqual(b);
  entry={...entry,id:2,tool:'workspace_undo_change',before:logs[0].before,after:logs[0].after};
  expect(unpack(await handlers.workspace_undo_change({changeId:2,confirm:true},c)).confirmed).toBe(true);
  entry={...entry,tool:'admin_update_group_settings',before:{whoCanJoin:'old'},after:a};
  await expect(prepareUndo({changeId:1},c)).rejects.toThrow('complete');
  c.allowedDomains=['other.test'];await expect(prepareUndo({changeId:1},c)).rejects.toThrow('outside_scope');
 });

});
