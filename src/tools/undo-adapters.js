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
