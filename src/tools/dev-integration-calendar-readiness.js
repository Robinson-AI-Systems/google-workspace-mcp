// P8-7: verify that an application's exact calendar availability window
// is readable, without exposing any attendee or busy-slot details to the
// integration diagnostic or silently accepting a Google 200 error envelope.
import {allowedTool} from '../rtc/catalog.js';

const ISO=/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,9})?)?(?:Z|[+-]\d\d:\d\d)$/;
const ID=/^[^\s/?#<>]{1,256}$/;
const MAX_WINDOWS=12,MAX_DAYS=31;
const isObject=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const parseDate=s=>{
 if(typeof s!=='string'||!ISO.test(s))return null;
 const t=Date.parse(s);
 return Number.isFinite(t)?t:null;
};
export function normalizeCalendarAvailability(input={}){
 const requests=input.calendarFreeBusyWindows===undefined?[]:input.calendarFreeBusyWindows;
 if(!Array.isArray(requests)||requests.length>MAX_WINDOWS)
  throw Error('calendarFreeBusyWindows must contain up to 12 exact availability windows.');
 const normalized=[],seen=new Set();
 for(const req of requests){
  if(!isObject(req)||Object.keys(req).sort().join(',')!=='calendarId,timeMax,timeMin'||
    typeof req.calendarId!=='string'||!ID.test(req.calendarId)||
    req.calendarId.trim()!==req.calendarId)
   throw Error('Each availability window requires an exact calendarId, timeMin and timeMax.');
  const min=parseDate(req.timeMin),max=parseDate(req.timeMax);
  if(min===null||max===null||min>=max||max-min>MAX_DAYS*86400000)
   throw Error('Availability windows require valid offset-aware ISO dates spanning at most 31 days.');
  const key=JSON.stringify([req.calendarId,req.timeMin,req.timeMax]);
  if(!seen.has(key)){
   seen.add(key);normalized.push({calendarId:req.calendarId,timeMin:req.timeMin,timeMax:req.timeMax});
  }
 }
 return {calendarFreeBusyWindows:normalized};
}
function failure(error){
 const status=Number(error?.response?.status||error?.code)||0;
 if(status===404)return {status:'missing',reason:'resource_not_found'};
 if(status===401||status===403)return {status:'not_readable',reason:'scope_or_access_denied'};
 return {status:'not_readable',reason:'google_probe_failed'};
}
const guide={url:'https://calendar.google.com',
 steps:[{n:1,action:'Open',target:'Google Calendar'},
  {n:2,action:'Verify',target:'Confirm the acting mailbox has availability access to the exact calendar and date range.'}],
 expected:'The app should have permission to read availability. No calendar data was changed.'};
const safeWindow=(window,start,end)=>isObject(window)&&typeof window.start==='string'&&
 typeof window.end==='string'&&parseDate(window.start)!==null&&
 parseDate(window.end)!==null&&
 parseDate(window.start)<parseDate(window.end)&&
 parseDate(window.start)>=start&&parseDate(window.end)<=end;
export async function inspectCalendarAvailability(request,clients){
 const checks=[];
 for(const {calendarId,timeMin,timeMax} of request.calendarFreeBusyWindows||[]){
  const kind='calendar_availability',name=calendarId;
  if(!allowedTool('calendar_get_freebusy',clients.rtcPolicy||{})){
   checks.push({kind,name,status:'not_readable',reason:'connection_area_excluded'});
   continue;
  }
  try{
   const response=await clients.calendar.freebusy.query({
    requestBody:{timeMin,timeMax,items:[{id:calendarId}]}
   });
   const data=response?.data,keys=Object.keys(data?.calendars||{});
   const item=data?.calendars?.[calendarId];
   if(!isObject(data)||!isObject(data.calendars)||keys.length!==1||
     keys[0]!==calendarId||!isObject(item)){
    checks.push({kind,name,status:'not_readable',reason:'unexpected_provider_calendar',fix:guide});
    continue;
   }
   if(Array.isArray(item.errors)&&item.errors.length>0){
    checks.push({kind,name,status:'not_readable',reason:'provider_calendar_error',fix:guide});
    continue;
   }
   if(!Array.isArray(item.busy)||!item.busy.every(x=>safeWindow(x,Date.parse(timeMin),Date.parse(timeMax)))){
    checks.push({kind,name,status:'not_readable',reason:'unverifiable_availability_shape',fix:guide});
    continue;
   }
   checks.push({kind,name,status:'ready'});
  }catch(error){checks.push({kind,name,...failure(error),fix:guide});}
 }
 return checks;
}
