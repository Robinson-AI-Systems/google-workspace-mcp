// RTC 1: conservative compact representations. The original is never discarded:
// oversized full payloads are stored behind a connection-bound retrieval handle.
const pick=(obj,keys)=>Object.fromEntries(keys.filter(k=>obj[k]!==undefined).map(k=>[k,obj[k]]));
const short=(s,n=160)=>typeof s==='string'&&s.length>n?s.slice(0,n)+'…':s;
function one(kind,o){
 if(!o||typeof o!=='object'||Array.isArray(o))return o;
 switch(kind){
 case 'message': {
   const hs=o.payload?.headers||[];
   const header=n=>hs.find(h=>h.name?.toLowerCase()===n)?.value;
   return {...pick(o,['id','threadId','snippet','labelIds','internalDate']),snippet:short(o.snippet),
     ...(header('subject')?{subject:short(header('subject'))}:{}),
     ...(header('from')?{from:short(header('from'))}:{})};
 }
 case 'thread':return {...pick(o,['id','snippet','historyId']),snippet:short(o.snippet),
   messageCount:Array.isArray(o.messages)?o.messages.length:undefined,
   messageIds:Array.isArray(o.messages)?o.messages.map(m=>m.id).filter(Boolean).slice(0,12):undefined};
 case 'file':return pick(o,['id','name','mimeType','size','modifiedTime','webViewLink','trashed','parents','owners']);
 case 'event':return {...pick(o,['id','summary','status','htmlLink','start','end','location','organizer']),
   description:o.description?short(o.description):undefined,
   attendeeCount:Array.isArray(o.attendees)?o.attendees.length:undefined};
 case 'user':return pick(o,['id','primaryEmail','name','orgUnitPath','suspended','isAdmin','lastLoginTime','creationTime']);
 case 'group':return pick(o,['id','email','name','description','directMembersCount','adminCreated']);
 case 'sheet': {
   const rows=Array.isArray(o.values)?o.values:[],
     meta=pick(o,['range','majorDimension']);
   return {...meta,rows:rows.length,columns:Math.max(0,...rows.map(r=>Array.isArray(r)?r.length:0)),
     preview:rows.slice(0,2).map(r=>Array.isArray(r)?r.slice(0,6).map(c=>short(c,100)):r)};
 }
 default:return o;
 }
}
export function googleSummaryKind(name){
 const prefix=String(name||'').split('_')[0];
 if(prefix==='gmail')return /thread/.test(name)?'thread':'message';
 if(prefix==='drive')return 'file';
 if(prefix==='calendar')return 'event';
 if(prefix==='admin'&&/group/.test(name))return 'group';
 if(prefix==='admin'&&/user/.test(name))return 'user';
 if(prefix==='sheets'&&/(range|values)/.test(name))return 'sheet';
 return null;
}
export function summarizeGoogleResult(name,data){
 const kind=googleSummaryKind(name);
 if(!kind||data===null||typeof data!=='object')return data;
 if(Array.isArray(data))return data.map(o=>one(kind,o));
 const candidates=kind==='message'?['messages']:kind==='thread'?['threads']:kind==='file'?['files']:kind==='event'?['items','events']:kind==='user'?['users']:kind==='group'?['groups']:kind==='sheet'?['valueRanges']:['items'];
 const key=candidates.find(k=>Array.isArray(data[k]));
 if(key)return {...pick(data,['nextPageToken','resultSizeEstimate','totalItems','total']),[key]:data[key].map(x=>one(kind,x)),
   returnedCount:data[key].length};
 return one(kind,data);
}
