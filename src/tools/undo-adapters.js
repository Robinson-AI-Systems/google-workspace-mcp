import {SETTING_KEYS} from './group-settings.js';
// Only lossless, reviewed snapshots can be replayed. Never execute a historical
// tool name or an arbitrary caller-provided provider request.
export function savedFields(value, keys) {
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Undo needs a complete saved snapshot.');
 const out={};
 for(const key of keys){
  if(!Object.hasOwn(value,key)||!['string','boolean'].includes(typeof value[key]))throw Error('Undo needs a complete saved snapshot for '+key+'.');
  if(/\[redacted\]|characters not stored|too deep/.test(String(value[key])))throw Error('Undo cannot restore redacted or shortened values.');
  out[key]=value[key];
 }
 return out;
}
const labelKeys=['name','labelListVisibility','messageListVisibility'];
const imapKeys=['enabled','autoExpunge','expungeBehavior','maxFolderSize'];
function imapState(v){
 if(!v||typeof v.enabled!=='boolean'||typeof v.autoExpunge!=='boolean'||
    !['archive','trash','deleteForever'].includes(v.expungeBehavior)||!Number.isInteger(v.maxFolderSize)||v.maxFolderSize<0)
   throw Error('Undo needs complete IMAP settings.');
 return Object.fromEntries(imapKeys.map(k=>[k,v[k]]));
}
const popKeys=['accessWindow','disposition'];
export const UNDO_ADAPTERS={
 gmail_label:{area:'mail',tools:['gmail_update_label'],state:v=>savedFields(v,labelKeys),target:e=>e.target,
  read:async(c,id)=>(await c.gmail.users.labels.get({userId:'me',id})).data,
  write:async(c,id,state)=>c.gmail.users.labels.patch({userId:'me',id,requestBody:state}),
  validateTarget:id=>typeof id==='string'&&/^Label_[A-Za-z0-9_-]+$/.test(id)},
 gmail_imap:{area:'mail',tools:['gmail_update_imap_settings'],state:imapState,target:()=> 'IMAP access',validateTarget:id=>id==='IMAP access',
  read:async c=>(await c.gmail.users.settings.getImap({userId:'me'})).data,
  write:async(c,_id,state)=>c.gmail.users.settings.updateImap({userId:'me',requestBody:state})},
 gmail_pop:{area:'mail',tools:['gmail_update_pop_settings'],state:v=>savedFields(v,popKeys),target:()=> 'POP access',validateTarget:id=>id==='POP access',
  read:async c=>(await c.gmail.users.settings.getPop({userId:'me'})).data,
  write:async(c,_id,state)=>c.gmail.users.settings.updatePop({userId:'me',requestBody:state})}
};

// File names/stars and calendar details only. Content, sharing, moves, guests
// and event notifications are intentionally outside the replay allowlist.
const googleId=id=>typeof id==='string'&&/^[A-Za-z0-9_@.:-]{1,200}$/.test(id);
UNDO_ADAPTERS.drive_name={area:'files',tools:['drive_rename_file'],state:v=>savedFields(v,['id','name','mimeType']),
 target:e=>e.target,validateTarget:googleId,
 read:async(c,id)=>(await c.drive.files.get({fileId:id,fields:'id,name,mimeType',supportsAllDrives:true})).data,
 write:async(c,id,state)=>c.drive.files.update({fileId:id,requestBody:{name:state.name},supportsAllDrives:true,fields:'id,name,mimeType'})};
UNDO_ADAPTERS.drive_star={area:'files',tools:['drive_star_file','drive_unstar_file'],state:v=>savedFields(v,['id','name','starred']),
 target:e=>e.target,validateTarget:googleId,
 read:async(c,id)=>(await c.drive.files.get({fileId:id,fields:'id,name,starred',supportsAllDrives:true})).data,
 write:async(c,id,state)=>c.drive.files.update({fileId:id,requestBody:{starred:state.starred},supportsAllDrives:true,fields:'id,name,starred'})};
UNDO_ADAPTERS.calendar_details={area:'calendar',tools:['calendar_update_calendar'],
 state:v=>({...savedFields(v,['id','summary','timeZone']),...savedFields({description:'',location:'',...v},['description','location'])}),
 // Resolve primary to the exact calendar saved by Google, never guess by name.
 target:e=>e.before?.id,validateTarget:googleId,
 read:async(c,id)=>(await c.calendar.calendars.get({calendarId:id})).data,
 write:async(c,id,state)=>c.calendar.calendars.patch({calendarId:id,requestBody:{summary:state.summary,description:state.description,timeZone:state.timeZone,location:state.location}})};

const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function aliasTarget(target){
 const match=typeof target==='string'&&target.match(/^([^ ]+) on ([^ ]+)$/);
 if(!match||!email.test(match[1])||!email.test(match[2]))throw Error('Undo requires exact alias and parent email addresses.');
 return {alias:match[1].toLowerCase(),parent:match[2].toLowerCase()};
}
function aliasesState(v){
 if(!Array.isArray(v?.aliases)||v.aliases.length>=100||v.aliases.some(x=>typeof x!=='string'||!email.test(x)))throw Error('Undo needs an untruncated alias list.');
 const aliases=v.aliases.map(x=>x.toLowerCase()).sort();
 if(new Set(aliases).size!==aliases.length)throw Error('Ambiguous saved aliases.');
 return {aliases};
}
for(const [kind,resource,tools] of [
 ['user_alias','users',['admin_add_user_alias','admin_delete_user_alias']],
 ['group_alias','groups',['admin_add_group_alias','admin_delete_group_alias']]
]){
 UNDO_ADAPTERS[kind]={area:'admin',tools,state:aliasesState,target:e=>e.target,
  validateTarget:id=>{try{aliasTarget(id);return true}catch{return false}},
  domains:id=>{const t=aliasTarget(id);return {alias:t.alias,[resource==='users'?'userKey':'groupKey']:t.parent}},
  validateTransition:(b,a,id)=>{
   const {alias}=aliasTarget(id),old=b.aliases.filter(x=>x!==alias),now=a.aliases.filter(x=>x!==alias);
   return JSON.stringify(old)===JSON.stringify(now)&&b.aliases.includes(alias)!==a.aliases.includes(alias);
  },
  read:async(c,id)=>{const t=aliasTarget(id);const r=await c.admin[resource].aliases.list({[resource==='users'?'userKey':'groupKey']:t.parent});return {aliases:(r.data.aliases||[]).map(x=>x.alias)};},
  write:async(c,id,state)=>{
   const t=aliasTarget(id),key={[resource==='users'?'userKey':'groupKey']:t.parent};
   if(state.aliases.includes(t.alias))await c.admin[resource].aliases.insert({...key,requestBody:{alias:t.alias}});
   else await c.admin[resource].aliases.delete({...key,alias:t.alias});
  }
 };
}
UNDO_ADAPTERS.group_settings={area:'admin',tools:['admin_update_group_settings'],
 target:e=>e.target,validateTarget:id=>typeof id==='string'&&email.test(id),domains:id=>({groupEmail:id}),
 state:v=>{
  // Saved snapshots contain every field that the existing settings guard reads.
  // Refuse incomplete historic snapshots instead of inventing defaults.
  return savedFields(v,SETTING_KEYS);
 },
 read:async(c,id)=>(await c.groupssettings.groups.get({groupUniqueId:id})).data,
 write:async(c,id,state)=>c.groupssettings.groups.patch({groupUniqueId:id,requestBody:state})};
