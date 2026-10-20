import {describe,it,expect} from 'vitest';
import {makeFakeClients,googleError} from '../helpers/fake-google.js';
import {tools,handlers} from '../../src/tools/tasks.js';
import {registry} from '../../src/tools/index.js';
import {isWrite} from '../../src/rtc/catalog.js';
import {isGuardedWrite} from '../../src/tools/write.js';

const value=r=>JSON.parse(r.content[0].text);
const named=(name)=>registry.tools.find(t=>t.name===name);
const fixture=(name,after={})=>{
 const f=makeFakeClients();f.clients.connection='task-provider-test';
 f.clients.store={recordChange:async()=>123};
 f.when('tasks.tasks.get').resolves({data:{id:'task-1',title:'New',notes:'note',status:'needsAction',parent:'parent-1'}});
 f.when('tasks.tasklists.get').resolves({data:{id:'list-1',title:'New'}});
 if(after.path)f.when(after.path).resolves({data:after.data});
 return f;
};

describe('full Google Tasks v1 method contract (6 tasklists + 8 tasks)',()=>{
 it('has exactly fourteen separately callable names including distinct PUT and move',()=>{
  expect(tools.map(t=>t.name)).toEqual([
   'tasks_list_tasklists','tasks_create_tasklist','tasks_get_tasklist',
   'tasks_update_tasklist','tasks_replace_tasklist','tasks_delete_tasklist',
   'tasks_list_tasks','tasks_get_task','tasks_create_task','tasks_update_task',
   'tasks_replace_task','tasks_move_task','tasks_delete_task','tasks_clear_completed'
  ]);
  for(const name of ['tasks_replace_tasklist','tasks_replace_task','tasks_move_task']){
   expect(isWrite(name)).toBe(true);
   expect(isGuardedWrite(registry.handlers[name])).toBe(true);
   expect(named(name).inputSchema.properties.confirm?.type).toBe('boolean');
   expect(named(name).inputSchema.properties.dryRun?.type).toBe('boolean');
  }
  expect(isWrite('tasks_list_tasks')).toBe(false);
 });
 it('supports bounded tasklist pages and never silently truncates a cursor',async()=>{
  const {clients,calls,when}=fixture();
  when('tasks.tasklists.list').resolves({data:{items:[{id:'l1'}],nextPageToken:'next'}});
  const first=value(await handlers.tasks_list_tasklists({},clients));
  expect(first).toEqual({items:[{id:'l1'}],nextPageToken:'next',complete:false});
  expect(calls[0]).toEqual({path:'tasks.tasklists.list',args:[{}]});
  const second=value(await handlers.tasks_list_tasklists({pageToken:'next',maxResults:10},clients));
  expect(second.nextPageToken).toBe('next');
  expect(calls[1].args[0]).toEqual({maxResults:10,pageToken:'next'});
  when('tasks.tasklists.list').resolves({data:{items:[]}});
  expect(value(await handlers.tasks_list_tasklists({},clients))).toEqual([]);
  expect(value(await handlers.tasks_list_tasklists({includePageInfo:true},clients)))
   .toEqual({items:[],nextPageToken:null,complete:true});
 });
 it('passes all official Google task filters to the provider, retaining an explicit nextPageToken',async()=>{
  const {clients,when,calls}=fixture();
  when('tasks.tasks.list').resolves({data:{items:[{id:'t1'}],nextPageToken:'follow'}});
  const args={tasklistId:'list-1',maxResults:100,pageToken:'before',
   completedMax:'2026-12-31T00:00:00Z',completedMin:'2026-01-01T00:00:00Z',
   dueMax:'2026-12-31T00:00:00Z',dueMin:'2026-01-01T00:00:00Z',
   updatedMin:'2026-01-02T00:00:00Z',showCompleted:false,
   showDeleted:true,showHidden:true,showAssigned:true};
  expect(value(await handlers.tasks_list_tasks(args,clients)))
   .toEqual({items:[{id:'t1'}],nextPageToken:'follow',complete:false});
  const request=calls.find(c=>c.path==='tasks.tasks.list').args[0];
  expect(request).toEqual({tasklist:'list-1',...Object.fromEntries(Object.entries(args).filter(([k])=>k!=='tasklistId'))});
  when('tasks.tasks.list').resolves({data:{items:[{id:'only'}]}});
  expect(value(await handlers.tasks_list_tasks({},clients))).toEqual([{id:'only'}]);
 });
 it('does not misinterpret malformed Google pagination responses as success',async()=>{
  for(const invalid of [null,[],{error:{code:403}},{items:{}},{items:null},{nextPageToken:42},{unexpected:'not tasks'}]){
   const {clients,when}=fixture();
   when('tasks.tasks.list').resolves({data:invalid});
   await expect(handlers.tasks_list_tasks({},clients)).rejects.toThrow(/Google returned/);
  }
  const {clients,when}=fixture();
  when('tasks.tasks.list').rejects(googleError(403,'forbidden','Google tasks denied'));
  await expect(handlers.tasks_list_tasks({},clients)).rejects.toThrow('Google tasks denied');
 });
 it('uses distinct exact provider methods: tasklists PATCH vs PUT, task PATCH vs PUT',async()=>{
  const {clients,calls}=fixture();
  await handlers.tasks_update_tasklist({tasklistId:'list-1',title:'New'},clients);
  await handlers.tasks_replace_tasklist({tasklistId:'list-1',title:'New'},clients);
  await handlers.tasks_update_task({tasklistId:'list-1',taskId:'task-1',title:'New',notes:'note'},clients);
  await handlers.tasks_replace_task({tasklistId:'list-1',taskId:'task-1',title:'New'},clients);
  expect(calls.map(x=>x.path)).toEqual([
   'tasks.tasklists.patch','tasks.tasklists.update','tasks.tasks.patch','tasks.tasks.update'
  ]);
  expect(calls[1].args[0]).toEqual({tasklist:'list-1',requestBody:{id:'list-1',title:'New'}});
  expect(calls[3].args[0]).toEqual({tasklist:'list-1',task:'task-1',requestBody:{id:'task-1',title:'New'}});
 });
 it('sends only approved position arguments to insert and move; no undocumented body',async()=>{
  const {clients,calls}=fixture();
  await handlers.tasks_create_task({tasklistId:'list-1',title:'New',parent:'parent-1',previous:'sibling-1'},clients);
  await handlers.tasks_move_task({tasklistId:'list-1',taskId:'task-1',parent:'parent-1',
   previous:'sibling-1',destinationTasklist:'list-2'},clients);
  expect(calls).toEqual([
   {path:'tasks.tasks.insert',args:[{tasklist:'list-1',parent:'parent-1',previous:'sibling-1',requestBody:{title:'New'}}]},
   {path:'tasks.tasks.move',args:[{tasklist:'list-1',task:'task-1',parent:'parent-1',
     previous:'sibling-1',destinationTasklist:'list-2'}]}
  ]);
 });
 it('previews and denies unconfirmed PUT or move without touching Google',async()=>{
  for(const [name,args,method]of [
   ['tasks_replace_tasklist',{tasklistId:'list-1',title:'New'},'tasks.tasklists.update'],
   ['tasks_replace_task',{tasklistId:'list-1',taskId:'task-1',title:'New'},'tasks.tasks.update'],
   ['tasks_move_task',{tasklistId:'list-1',taskId:'task-1',destinationTasklist:'list-2'},'tasks.tasks.move']
  ]){
   for(const opts of [{dryRun:true},{}]){
    const {clients,calls}=fixture(name);
    const result=value(await registry.handlers[name]({...args,...opts},clients));
    expect(result.done).toBe(false);
    expect(result.dryRun===true||result.needsConfirmation===true).toBe(true);
    expect(calls.some(c=>c.path===method)).toBe(false);
   }
  }
 });
 it('confirmed user choice executes exactly once with Google after-readback and unchanged other methods',async()=>{
  const {clients,calls}=fixture();
  const r=value(await registry.handlers.tasks_replace_tasklist({
   tasklistId:'list-1',title:'New',confirm:true},clients));
  expect(r).toMatchObject({done:true,confirmed:true,logged:true});
  expect(calls.filter(c=>c.path==='tasks.tasklists.update')).toHaveLength(1);
  expect(calls.filter(c=>c.path==='tasks.tasklists.get')).toHaveLength(2);
 });
});
