// Server-owned issuance validation, shared by SQL and the fake contract adapter.
import {RTC_AREAS} from './catalog.js';
export function passOptions({areas=null,rateLimit=120,hours=24,forHub=false,allowWrites=false,confirmedAccount,googleAccount}={}){
 const account=String(googleAccount||'').trim().toLowerCase();
 if(typeof forHub!=='boolean'||typeof allowWrites!=='boolean')throw Error('Pass options must be explicit booleans.');
 if(forHub&&allowWrites)throw Error('Toolkit passes are read only; create a separate temporary TEST write pass.');
 const limit=Number(rateLimit),ttl=Number(hours);
 if(!Number.isInteger(limit)||limit<1||limit>600)throw Error('Rate limit must be 1–600 per minute.');
 if(!Number.isInteger(ttl)||ttl<1||ttl>(forHub?365*24:30*24))throw Error('Pass duration exceeds the allowed range.');
 if(areas!==null&&(!Array.isArray(areas)||areas.length===0||areas.length>RTC_AREAS.length||new Set(areas).size!==areas.length||areas.some(x=>!RTC_AREAS.includes(x))))throw Error('Invalid areas.');
 if(allowWrites&&(confirmedAccount!==account||!areas||ttl>24))throw Error('TEST writes require the exact account confirmation, explicit areas and at most 24 hours.');
 return {account,areas,limit,ttl,forHub,allowWrites,profile:allowWrites?'full':'read_only'};
}
