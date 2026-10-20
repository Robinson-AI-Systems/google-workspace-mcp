import {ok,googleList} from './util.js';

const string={type:'string'};
const listId={type:'string',default:'@default'};
const positivePage={type:'integer',minimum:1,maximum:100};
const bool={type:'boolean'};
// All 14 official Google Tasks v1 methods are represented by separately
// callable MCP tools. Keep the historical PATCH names and old complete-page
// array results for existing clients.
const taskFields={title:string,notes:string,due:{type:'string',description:'RFC3339 scheduled date (Google keeps date only)'},status:{type:'string',enum:['needsAction','completed']}};
const positionFields={parent:string,previous:string};
const taskListPaging={maxResults:positivePage,pageToken:string,includePageInfo:bool};
const taskPaging={
 ...taskListPaging,
 completedMax:string,completedMin:string,dueMax:string,dueMin:string,updatedMin:string,
 showCompleted:{type:'boolean',default:true},showDeleted:bool,showHidden:bool,showAssigned:bool
};
const props=(fields,required=[])=>({type:'object',properties:fields,required});
const taskArg={tasklistId:listId,taskId:string};
const lists=props(taskListPaging);
const listTasks=props({tasklistId:listId,...taskPaging});
export const tools=[
 {name:'tasks_list_tasklists',description:'List own Google tasklists. Pass maxResults/pageToken or includePageInfo:true for nextPageToken; a partial page is always labeled.',inputSchema:lists},
 {name:'tasks_create_tasklist',description:'Create a new task list',inputSchema:props({title:string},['title'])},
 {name:'tasks_get_tasklist',description:'Get one task list',inputSchema:props({tasklistId:string},['tasklistId'])},
 {name:'tasks_update_tasklist',description:'PATCH selected task list fields',inputSchema:props({tasklistId:string,title:string},['tasklistId','title'])},
 {name:'tasks_replace_tasklist',description:'PUT replace a task list via Google tasklists.update (distinct from PATCH).',inputSchema:props({tasklistId:string,title:string},['tasklistId','title'])},
 {name:'tasks_delete_tasklist',description:'Delete a task list',inputSchema:props({tasklistId:string},['tasklistId'])},
 {name:'tasks_list_tasks',description:'List own tasks with all Google v1 filters and page cursors. Partial pages always include nextPageToken.',inputSchema:listTasks},
 {name:'tasks_get_task',description:'Get one task',inputSchema:props(taskArg,['taskId'])},
 {name:'tasks_create_task',description:'Create a task, optionally beneath parent/after previous sibling.',inputSchema:props({tasklistId:listId,...taskFields,...positionFields},['title'])},
 {name:'tasks_update_task',description:'PATCH selected task fields',inputSchema:props({ ...taskArg,...taskFields },['taskId'])},
 {name:'tasks_replace_task',description:'PUT replace a task resource with explicit fields; unspecified editable fields may be cleared.',inputSchema:props({...taskArg,...taskFields},['taskId','title'])},
 {name:'tasks_move_task',description:'Move a task within or across own task lists, optionally under a parent/after sibling.',inputSchema:props({...taskArg,...positionFields,destinationTasklist:string},['taskId'])},
 {name:'tasks_delete_task',description:'Delete a task',inputSchema:props(taskArg,['taskId'])},
 {name:'tasks_clear_completed',description:'Clear completed tasks in one task list',inputSchema:props({tasklistId:listId})}
];
const tasklist=a=>a.tasklistId||'@default';
const only=(a,fields)=>Object.fromEntries(fields.filter(k=>a[k]!==undefined).map(k=>[k,a[k]]));
const listResult=(args,data)=>{
 const result=googleList(data,'items',['kind','etag','nextPageToken']);
 const more=result.nextPageToken||null;
 return ok(args.includePageInfo===true||args.pageToken!==undefined||args.maxResults!==undefined||more
   ?{items:result.items,nextPageToken:more,complete:!more}
   :result.items);
};
const body=(a,withId)=>({...withId?{id:a.taskId}:{},...only(a,['title','notes','due','status'])});
export const handlers={
 tasks_list_tasklists:async(args,{tasks})=>{
  const res=await tasks.tasklists.list(only(args,['maxResults','pageToken']));
  return listResult(args,res.data);
 },
 tasks_create_tasklist:async(args,{tasks})=>ok((await tasks.tasklists.insert({requestBody:{title:args.title}})).data),
 tasks_get_tasklist:async(args,{tasks})=>ok((await tasks.tasklists.get({tasklist:args.tasklistId})).data),
 tasks_update_tasklist:async(args,{tasks})=>ok((await tasks.tasklists.patch({tasklist:args.tasklistId,requestBody:{title:args.title}})).data),
 tasks_replace_tasklist:async(args,{tasks})=>ok((await tasks.tasklists.update({tasklist:args.tasklistId,requestBody:{id:args.tasklistId,title:args.title}})).data),
 tasks_delete_tasklist:async(args,{tasks})=>{
  await tasks.tasklists.delete({tasklist:args.tasklistId});return ok({deleted:args.tasklistId});
 },
 tasks_list_tasks:async(args,{tasks})=>{
  const query={tasklist:tasklist(args),...only(args,[
   'maxResults','pageToken','completedMax','completedMin','dueMax','dueMin',
   'updatedMin','showCompleted','showDeleted','showHidden','showAssigned'])};
  if(query.showCompleted===undefined)query.showCompleted=true;
  const res=await tasks.tasks.list(query);
  return listResult(args,res.data);
 },
 tasks_get_task:async(args,{tasks})=>ok((await tasks.tasks.get({tasklist:tasklist(args),task:args.taskId})).data),
 tasks_create_task:async(args,{tasks})=>ok((await tasks.tasks.insert({
  tasklist:tasklist(args),...only(args,['parent','previous']),requestBody:body(args,false)
 })).data),
 tasks_update_task:async(args,{tasks})=>ok((await tasks.tasks.patch({
  tasklist:tasklist(args),task:args.taskId,requestBody:body(args,false)
 })).data),
 tasks_replace_task:async(args,{tasks})=>ok((await tasks.tasks.update({
  tasklist:tasklist(args),task:args.taskId,requestBody:body(args,true)
 })).data),
 tasks_move_task:async(args,{tasks})=>ok((await tasks.tasks.move({
  tasklist:tasklist(args),task:args.taskId,...only(args,['parent','previous','destinationTasklist'])
 })).data),
 tasks_delete_task:async(args,{tasks})=>{
  await tasks.tasks.delete({tasklist:tasklist(args),task:args.taskId});return ok({deleted:args.taskId});
 },
 tasks_clear_completed:async(args,{tasks})=>{
  await tasks.tasks.clear({tasklist:tasklist(args)});return ok({status:'cleared'});
 }
};
