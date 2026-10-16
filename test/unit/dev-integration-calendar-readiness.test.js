import {describe,it,expect} from 'vitest';
import {normalizeCalendarAvailability,inspectCalendarAvailability}
 from '../../src/tools/dev-integration-calendar-readiness.js';
import {inspectGoogleIntegration,validateIntegrationSpec,tools as integrationTools}
 from '../../src/tools/dev-integration.js';

const min='2026-10-20T09:00:00-06:00',max='2026-10-20T17:00:00-06:00';
const window={calendarId:'owned-calendar',timeMin:min,timeMax:max};
function mock({deny=false,areas=null,wrong=false,busy=[],errors=null}={}){
 const calls=[];
 const clients={
  actingAs:'dev@example.test',
  rtcPolicy:{profile:'read_only',areas},
  calendar:{freebusy:{query:async args=>{
    calls.push(args);
    if(deny){const e=Error('Private calendar status must stay private');e.response={status:403};throw e;}
    return {data:{kind:'calendar#freeBusy',timeMin:args.requestBody.timeMin,timeMax:args.requestBody.timeMax,calendars:{
      [wrong?'foreign-calendar':'owned-calendar']:{
        ...(errors?{errors}:{}),busy
      }
    }}};
  }}}
 };
 return {clients,calls};
}
describe('P8-7 exact Calendar free/busy availability diagnostics',()=>{
 it('accepts and deduplicates exact owner-provided offset-aware windows',()=>{
  expect(normalizeCalendarAvailability({})).toEqual({calendarFreeBusyWindows:[]});
  expect(normalizeCalendarAvailability({calendarFreeBusyWindows:[window,window]}).calendarFreeBusyWindows).toEqual([window]);
  expect(validateIntegrationSpec({apis:[],calendarFreeBusyWindows:[window]}).calendarFreeBusyWindows).toEqual([window]);
 });
 it('rejects unknown or overly wide dates, URL resource IDs, and extra fields before any reads',()=>{
  const invalid=[
   {...window,timeMin:'2026-10-20T09:00:00'},
   {...window,timeMax:'2026-10-19T09:00:00Z'},
   {...window,timeMax:'2026-12-20T09:00:00Z'},
   {...window,calendarId:'https://example.test'},
   {...window,confirm:true},
   {...window,calendarId:''},
   {...window,timeMin:'yesterday'},
   {...window,timeMax:'2026-02-40T09:00:00Z'},
   {...window,timeMin:1}
  ];
  for(const item of invalid){
   expect(()=>normalizeCalendarAvailability({calendarFreeBusyWindows:[item]}),JSON.stringify(item)).toThrow();
  }
  expect(()=>normalizeCalendarAvailability({calendarFreeBusyWindows:Array(13).fill(window)})).toThrow();
 });
 it('observes real exact Calendar availability response but returns no busy slot contents',async()=>{
  const {clients,calls}=mock({busy:[{start:'2026-10-20T10:00:00-06:00',
   end:'2026-10-20T11:00:00-06:00'}]});
  const result=await inspectGoogleIntegration({apis:[],calendarFreeBusyWindows:[window]},clients);
  expect(result).toMatchObject({status:'ready',changesMade:false});
  expect(result.checks).toEqual([{kind:'calendar_availability',name:'owned-calendar',status:'ready'}]);
  expect(calls).toEqual([{requestBody:{timeMin:min,timeMax:max,items:[{id:'owned-calendar'}]}}]);
  expect(JSON.stringify(result)).not.toContain('2026-10-20T10:00:00-06:00');
 });
 it('never counts foreign, partial, broken or error-calendar responses as ready',async()=>{
  const wrong=await inspectCalendarAvailability(normalizeCalendarAvailability({
   calendarFreeBusyWindows:[window]}),mock({wrong:true}).clients);
  expect(wrong[0]).toMatchObject({status:'not_readable',reason:'unexpected_provider_calendar'});
  const errors=await inspectCalendarAvailability(normalizeCalendarAvailability({
   calendarFreeBusyWindows:[window]}),mock({errors:[{domain:'calendar',reason:'forbidden'}]}).clients);
  expect(errors[0]).toMatchObject({status:'not_readable',reason:'provider_calendar_error'});
  const malformed=await inspectCalendarAvailability(normalizeCalendarAvailability({
   calendarFreeBusyWindows:[window]}),mock({busy:[{start:'2026-10-20T10:00:00-06:00',
    end:'2026-10-23T10:00:00-06:00'}]}).clients);
  expect(malformed[0]).toMatchObject({status:'not_readable',reason:'unverifiable_availability_shape'});
 });
 it('accepts the observed floored boundary second while keeping the echoed exact query',async()=>{
  const exact={calendarId:'owned-calendar',timeMin:'2026-10-20T09:00:00.493-06:00',timeMax:'2026-10-20T10:00:00.493-06:00'};
  const request=normalizeCalendarAvailability({calendarFreeBusyWindows:[exact]});
  const good=mock({busy:[{start:'2026-10-20T09:00:00-06:00',end:'2026-10-20T10:00:00-06:00'}]});
  expect((await inspectCalendarAvailability(request,good.clients))[0].status).toBe('ready');
  expect(good.calls[0].requestBody.timeMin).toBe(exact.timeMin);
  for(const start of ['2026-10-20T08:59:59-06:00','2026-10-20T09:00:00.100-06:00']){
   const bad=mock({busy:[{start,end:'2026-10-20T10:00:00-06:00'}]});
   expect((await inspectCalendarAvailability(request,bad.clients))[0]).toMatchObject({status:'not_readable',reason:'unverifiable_availability_shape'});
  }
 });
 it('refuses missing or different echoed query windows',async()=>{
  for(const echo of [{},{timeMin:'2026-10-21T09:00:00-06:00',timeMax:max}]){
   const {clients}=mock();clients.calendar.freebusy.query=async()=>({data:{...echo,calendars:{'owned-calendar':{busy:[]}}}});
   expect((await inspectCalendarAvailability({calendarFreeBusyWindows:[window]},clients))[0]).toMatchObject({status:'not_readable',reason:'unexpected_provider_window'});
  }
 });
 it('rejects forbidden areas before provider calls and labels real 403 as unreadable',async()=>{
  const scope=mock({areas:['mail']});
  const out=await inspectGoogleIntegration({apis:[],calendarFreeBusyWindows:[window]},scope.clients);
  expect(out.status).toBe('not_readable');
  expect(out.checks[0]).toMatchObject({status:'not_readable',reason:'connection_area_excluded'});
  expect(scope.calls).toHaveLength(0);
  const denied=mock({deny:true});
  const result=await inspectGoogleIntegration({apis:[],calendarFreeBusyWindows:[window]},denied.clients);
  expect(result.status).toBe('not_readable');
  expect(result.checks[0].reason).toBe('scope_or_access_denied');
  expect(JSON.stringify(result)).not.toContain('Private calendar status');
 });
 it('only advertises a guarded metadata read on the existing published integration tool',()=>{
  const field=integrationTools[0].inputSchema.properties.spec.properties.calendarFreeBusyWindows;
  expect(field.type).toBe('array');
  expect(field.maxItems).toBe(12);
  expect(field.items.required).toEqual(['calendarId','timeMin','timeMax']);
 });
});
