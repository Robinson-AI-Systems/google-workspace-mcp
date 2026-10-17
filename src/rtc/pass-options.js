// Server-owned issuance validation. Existing TEST passes keep their exact policy.
import { RTC_AREAS } from './catalog.js';
export function testAccountEnrolled(account,configured=process.env.RTC_TEST_ACCOUNT_EMAILS){
 if(typeof account!=='string'||!account.trim())return false;
 const selected=String(configured||'').split(',').map(x=>x.trim().toLowerCase())
   .filter(x=>/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x));
 return selected.includes(account.trim().toLowerCase());
}
export function passOptions({mode='test',areas=null,rateLimit=120,hours=24,forHub=false,
  allowWrites=false,profile,confirmedAccount,googleAccount}={}){
 const account=String(googleAccount||'').trim().toLowerCase();
 if(!['test','live'].includes(mode))throw Error('RTC mode must be test or live.');
 if(typeof forHub!=='boolean'||typeof allowWrites!=='boolean')throw Error('Pass options must be explicit booleans.');
 const limit=Number(rateLimit),ttl=Number(hours);
 if(!Number.isInteger(limit)||limit<1||limit>600)throw Error('Rate limit must be 1–600 per minute.');
 const maxHours=mode==='live'&&allowWrites?720:forHub?365*24:720;
 if(!Number.isInteger(ttl)||ttl<1||ttl>maxHours)throw Error('Pass duration exceeds the allowed range.');
 if(areas!==null&&(!Array.isArray(areas)||areas.length===0||
    areas.length>RTC_AREAS.length||new Set(areas).size!==areas.length||
    areas.some(x=>!RTC_AREAS.includes(x))))throw Error('Invalid areas.');
 if(mode==='test'){
   // Older D-4 TEST and sandbox contracts are unchanged, including Hub readonly.
   if(forHub&&allowWrites)throw Error('Toolkit TEST passes must remain read-only.');
   if(allowWrites&&(confirmedAccount!==account||!areas||ttl>24))
     throw Error('TEST writes require exact account confirmation, explicit areas and at most 24 hours.');
   return {account,areas,limit,ttl,forHub,allowWrites,profile:allowWrites?'full':'read_only',mode};
 }
 // Live enrollment is owner-authenticated in the existing protected pass form.
 // No TEST account allowlist is applied to properly owned live connections.
 if(!['read_only','everyday','full'].includes(profile))throw Error('Choose an explicit live profile.');
 if(!areas)throw Error('Live passes require explicitly selected areas.');
 if(allowWrites!==(profile!=='read_only'))throw Error('Live write authorization must match the selected profile.');
 if(allowWrites&&confirmedAccount!==account)throw Error('Confirm the exact account for live writes.');
 return {account,areas,limit,ttl,forHub,allowWrites,profile,mode};
}
