// Stateful Google-shaped fixture provider; unknown methods fail instead of
// returning permissive success. No Google SDK or network is used.
const account='rtc-fixture@example.test';
const labels=new Map([['Label_state',{id:'Label_state',name:'original',type:'user'}],
 ...Array.from({length:220},(_,i)=>['large_'+i,{id:'large_'+i,name:'large-'+i+'x'.repeat(100),type:'user'}])]);
const files=new Map(),events=new Map(),messages=new Map(),counts={};
let sequence=0,fault;
const missing=()=>{throw Object.assign(Error('synthetic missing'),{code:404});};
const get=(map,id)=>map.has(id)?structuredClone(map.get(id)):missing();
const apply=(name,fn)=>(args)=>{
 counts[name]=(counts[name]||0)+1;
 const value=fn(args);
 if(fault===name){fault=null;throw Object.assign(Error('synthetic response lost after commit'),{code:500});}
 return Promise.resolve({data:structuredClone(value)});
};
export const control={fault:name=>{fault=name;},counts:()=>({...counts})};
const notTrashed=f=>!f.trashed;
const drive={files:{
 create:apply('drive.create',({requestBody,supportsAllDrives})=>{
  if(supportsAllDrives!==false)throw Error('unexpected shared-drive request');
  const f={id:'file_'+(++sequence),...requestBody,parents:requestBody.parents||[],owners:[{emailAddress:account}],trashed:false};
  files.set(f.id,f);return f;
 }),
 get:apply('drive.get',({fileId,fields})=>{
  const file=get(files,fileId);const projected={};
  for(const [key,value] of Object.entries(file))if(new RegExp('(?:^|,)'+key+'(?:\\(|,|$)').test(fields||''))projected[key]=value;
  return projected;
 }),
 list:apply('drive.list',({q,pageSize})=>{
  if(pageSize!==100)throw Error('unexpected fixture page size');
  let rows=[...files.values()].filter(notTrashed);
  const parent=/^'([^']+)' in parents/.exec(q||'');
  if(parent)rows=rows.filter(f=>f.parents.includes(parent[1]));
  else{
   const run=/key='rtc_run' and value='([^']+)'/.exec(q||'');
   const kind=/key='rtc_kind' and value='([^']+)'/.exec(q||'');
   if(!run||!kind)throw Error('unbounded fixture search');
   rows=rows.filter(f=>f.appProperties?.rtc_run===run[1]&&f.appProperties?.rtc_kind===kind[1]);
  }
  return {files:rows};
 }),
 update:apply('drive.update',({fileId,requestBody})=>{
  const f=get(files,fileId);if(requestBody.trashed!==true)throw Error('only reversible trash supported');
  f.trashed=true;files.set(fileId,f);return f;
 })
}};
const calendar={calendarList:{get:apply('calendar.owner',({calendarId})=>{
 if(calendarId!=='fixture-calendar')missing();return {id:calendarId,primary:false,accessRole:'owner'};
})},events:{
 insert:apply('calendar.insert',({calendarId,requestBody,sendUpdates})=>{
  if(calendarId!=='fixture-calendar'||sendUpdates!=='none'||requestBody.attendees.length)throw Error('unsafe event request');
  const e={id:'event_'+(++sequence),...requestBody,status:'confirmed',creator:{email:account}};events.set(e.id,e);return e;
 }),
 get:apply('calendar.get',({eventId})=>get(events,eventId)),
 list:apply('calendar.list',({privateExtendedProperty})=>({items:[...events.values()].filter(e=>e.status!=='cancelled'&&privateExtendedProperty.every(p=>{
  const [key,value]=p.split('=');return e.extendedProperties.private[key]===value;
 }))})),
 delete:apply('calendar.delete',({eventId,sendUpdates})=>{
  if(sendUpdates!=='none')throw Error('guest notification forbidden');const e=get(events,eventId);events.set(eventId,{id:e.id,status:'cancelled'});return {};
 })
}};
const gmail={users:{getProfile:apply('gmail.profile',()=>({emailAddress:account})),labels:{
 list:apply('gmail.labels.list',()=>({labels:[...labels.values()]})),
 get:apply('gmail.labels.get',({id})=>get(labels,id)),
 update:apply('gmail.labels.update',({id,requestBody})=>{const l={...get(labels,id),...requestBody};labels.set(id,l);return l;}),
 create:apply('gmail.labels.create',({requestBody})=>{const l={id:'Label_'+(++sequence),type:'user',...requestBody};labels.set(l.id,l);return l;}),
 delete:apply('gmail.labels.delete',({id})=>{get(labels,id);labels.delete(id);return {};})
},messages:{
 insert:apply('gmail.insert',({requestBody})=>{
  const raw=Buffer.from(requestBody.raw,'base64url').toString('utf8');
  const headers=raw.split('\r\n\r\n')[0].split('\r\n').map(line=>{const n=line.indexOf(':');return {name:line.slice(0,n),value:line.slice(n+1).trim()};});
  const m={id:'message_'+(++sequence),labelIds:requestBody.labelIds,payload:{headers}};messages.set(m.id,m);return {id:m.id};
 }),
 get:apply('gmail.get',({id,format})=>{if(format!=='metadata')throw Error('unexpected message body read');return get(messages,id);}),
 list:apply('gmail.list',({labelIds,maxResults})=>{
  if(maxResults!==100)throw Error('unexpected fixture page size');
  return {messages:[...messages.values()].filter(m=>labelIds.every(id=>m.labelIds.includes(id))).map(m=>({id:m.id}))};
 }),
 trash:apply('gmail.trash',({id})=>{const m=get(messages,id);m.labelIds=[...new Set([...m.labelIds,'TRASH'])];messages.set(id,m);return m;})
}}};
export async function buildHostedApiClients(email){
 if(email!==account)throw Error('synthetic provider refuses foreign accounts');
 return {actingAs:account,gmail,drive,calendar};
}
export async function ensureMigrated(){}
