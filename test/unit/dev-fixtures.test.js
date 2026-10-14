import {describe,it,expect,vi,beforeEach} from 'vitest';
import {makeFakeClients} from '../helpers/fake-google.js';
import {createFakeDb} from '../helpers/fake-db.js';
const state=vi.hoisted(()=>({db:null}));
vi.mock('../../src/db.js',async(importActual)=>{
  const real=await importActual();
  return Object.fromEntries(Object.keys(real).map(n=>[n,(...a)=>state.db[n](...a)]));
});
const {handlers,tools}=await import('../../src/tools/dev-fixtures.js');
const {isWrite,allowedTool}=await import('../../src/rtc/catalog.js');
const {calendarReadback,inspectCalendarCleanup,confirmCalendarGone,deleteRecordedCalendarFixture,exactCalendarEvent}=await import('../../src/tools/dev-calendar.js');
const body=r=>JSON.parse(r.content[0].text);
beforeEach(()=>{state.db=createFakeDb();});
function setup(){
 const {clients,calls,when}=makeFakeClients();
 clients.connection='owner-A';clients.rtcPolicy={mode:'test',profile:'full',areas:['workspace','files']};
 let n=0;const byId=new Map();
 when('drive.files.create').resolves(({requestBody})=>{
   const id='fixture'+(++n);
   const value={id,...requestBody,owners:[{emailAddress:clients.actingAs}],trashed:false};
   byId.set(id,value);
   return {data:value};
 });
 when('drive.files.get').resolves(({fileId})=>({data:byId.get(fileId)||{}}));
 when('drive.files.list').resolves(({q})=>({data:{files:[...byId.values()].filter(f=>f.appProperties?.rtc_run&&q.includes(f.appProperties.rtc_run)&&q.includes(f.appProperties.rtc_kind))}}));
 return {clients,calls,when,byId};
}
describe('P8-7 Drive test fixtures',()=>{
 it('previews without Google mutations or creating a run',async()=>{
   const {clients,calls}=setup();
   const r=body(await handlers.workspace_dev_create_fixtures({scenario:'files',dryRun:true},clients));
   expect(r).toMatchObject({done:false,dryRun:true});
   expect(calls.filter(c=>c.path==='drive.files.create')).toHaveLength(0);
   expect(state.db.__state.devRuns.size).toBe(0);
 });
 it('records exact tagged IDs, reads each back, and isolates connections',async()=>{
   const {clients,calls}=setup();
   const r=body(await handlers.workspace_dev_create_fixtures({scenario:'files'},clients));
   expect(r.confirmed).toBe(true);
   const id=r.details.runId,run=await state.db.getDevRun({runId:id,actingAs:clients.actingAs,connection:clients.connection});
   expect(run.objects.map(x=>x.kind)).toEqual(['folder','doc','sheet']);
   expect(run.objects.map(x=>x.google_id)).toEqual(['fixture1','fixture2','fixture3']);
   expect(calls.filter(x=>x.path==='drive.files.create').every(x=>x.args[0].requestBody.appProperties.rtc_run===id)).toBe(true);
   expect(await state.db.getDevRun({runId:id,actingAs:clients.actingAs,connection:'other'})).toBeNull();
   expect(await state.db.getDevRun({runId:id,actingAs:'other@example.test',connection:clients.connection})).toBeNull();
   expect((await state.db.listRecentChanges())[0].tool).toBe('workspace_dev_create_fixtures');
 });
 it('rejects a folder not demonstrably owned and never creates resources',async()=>{
   const {clients,calls,when}=setup();
   when('drive.files.get').resolves({data:{id:'folder123',mimeType:'application/vnd.google-apps.folder',owners:[{emailAddress:'someone@example.test'}]}});
   await expect(handlers.workspace_dev_create_fixtures({scenario:'files',folder:'folder123',dryRun:true},clients)).rejects.toThrow(/owned/);
   expect(calls.some(c=>c.path==='drive.files.create')).toBe(false);
 });
 it('requires valid actor and full read-back proof',async()=>{
   const {clients,when}=setup();
   when('drive.files.get').resolves({data:{id:'fixture1',appProperties:{}}});
   const r=body(await handlers.workspace_dev_create_fixtures({scenario:'files'},clients));
   expect(r.confirmed).toBe(false);
   await expect(handlers.workspace_dev_create_fixtures({scenario:'files'},{...clients,connection:null})).rejects.toThrow(/authenticated/);
 });
 it('does not confirm a Drive fixture whose readback has changed identity',async()=>{
    for(const [slot,alter] of [
      ['fixture2',x=>({...x,mimeType:'application/vnd.google-apps.folder'})],
      ['fixture2',x=>({...x,owners:[{emailAddress:'foreign@example.test'}]})],
      ['fixture2',x=>({...x,appProperties:{...x.appProperties,rtc_kind:'sheet'}})],
      ['fixture3',x=>({...x,parents:['unrelated-folder']})]
    ]){
      const s=setup();
      s.when('drive.files.get').resolves(({fileId})=>{
        const found=s.byId.get(fileId);
        return {data:found&&fileId===slot?alter(found):found||{}};
      });
      const out=body(await handlers.workspace_dev_create_fixtures({scenario:'files'},s.clients));
      expect(out.confirmed,slot).toBe(false);
    }
  });
  it('refuses a caller-selected parent when its provider ID differs',async()=>{
    const s=setup();
    s.when('drive.files.get').resolves({data:{id:'different-owned-folder',mimeType:'application/vnd.google-apps.folder',owners:[{emailAddress:s.clients.actingAs}]}});
    await expect(handlers.workspace_dev_create_fixtures({scenario:'files',folder:'owned-folder-123',dryRun:true},s.clients)).rejects.toThrow(/owned/);
    expect(s.calls.filter(c=>c.path==='drive.files.create')).toHaveLength(0);
  });
  it('is a write forbidden to read-only and everyday Workspace profiles',()=>{
   expect(tools[0].inputSchema.properties.dryRun).toBeDefined();
   expect(isWrite('workspace_dev_create_fixtures')).toBe(true);
   expect(allowedTool('workspace_dev_create_fixtures',{profile:'read_only'})).toBe(false);
   expect(allowedTool('workspace_dev_create_fixtures',{profile:'everyday'})).toBe(false);
 });
});

describe('P8-7 precise confirmed cleanup',()=>{
 function ready(){
   const {clients,calls,when}=makeFakeClients();clients.connection='owner-A';clients.rtcPolicy={mode:'test',profile:'full',areas:['workspace','files']};
   const byId=new Map();
   const run='4ab45b6c-013e-4f66-8c4a-ccccccccccca';
   const objects=[['folder','f-root','application/vnd.google-apps.folder'],['doc','d-1','application/vnd.google-apps.document'],['sheet','s-1','application/vnd.google-apps.spreadsheet']];
   const owner={emailAddress:clients.actingAs};
   for(const [kind,id,mimeType] of objects)byId.set(id,{id,mimeType,appProperties:{rtc_run:run,rtc_kind:kind},parents:kind==='folder'?undefined:['f-root'],owners:[owner],trashed:false});
   byId.set('sibling',{id:'sibling',mimeType:'application/vnd.google-apps.document',appProperties:{},owners:[owner],trashed:false});
   when('drive.files.get').resolves(({fileId})=>({data:{...byId.get(fileId)}}));
   when('drive.files.update').resolves(({fileId,requestBody})=>{byId.set(fileId,{...byId.get(fileId),...requestBody});return {data:{id:fileId,trashed:true}};});
   return {clients,calls,when,byId,run,objects,owner};
 }
 async function seeded(s){
   await state.db.startDevRun({id:s.run,actingAs:s.clients.actingAs,connection:s.clients.connection,scenario:'files'});
   for(const [kind,googleId] of s.objects){
     const input={runId:s.run,actingAs:s.clients.actingAs,connection:s.clients.connection,kind,googleId,parentId:kind==='folder'?null:'f-root'};
     await state.db.reserveDevStep(input);
     await state.db.recordDevObject(input);
     await state.db.markDevStepRecorded(input);
   }
 }
 it('no confirmation means zero writes; dry-run lists only recorded IDs',async()=>{
   const s=ready();await seeded(s);
   const preview=body(await handlers.workspace_dev_cleanup({runId:s.run,dryRun:true},s.clients));
   expect(preview.dryRun).toBe(true);
   expect(preview.before.objects.map(x=>x.id).sort()).toEqual(['d-1','f-root','s-1']);
   expect(body(await handlers.workspace_dev_cleanup({runId:s.run},s.clients)).needsConfirmation).toBe(true);
   expect(s.calls.filter(x=>x.path==='drive.files.update')).toHaveLength(0);
 });
 it('trashes only exact recorded IDs in children-first order, no permanent deletion',async()=>{
   const s=ready();await seeded(s);
   const result=body(await handlers.workspace_dev_cleanup({runId:s.run,confirm:true},s.clients));
   expect(result.confirmed).toBe(true);
   expect(result.details.fullyCleaned).toBe(true);
   expect(s.calls.filter(x=>x.path==='drive.files.update').map(x=>x.args[0].fileId)).toEqual(['s-1','d-1','f-root']);
   expect(s.calls.filter(x=>x.path==='drive.files.delete')).toHaveLength(0);
   expect(s.byId.get('sibling').trashed).toBe(false);
   expect((await state.db.getDevRun({runId:s.run,actingAs:s.clients.actingAs,connection:s.clients.connection})).objects.every(x=>!!x.cleaned_at)).toBe(true);
 });
 it('refuses tampered tags and foreign connections without any destructive call',async()=>{
   const s=ready();await seeded(s);
   s.byId.get('d-1').appProperties.rtc_run='some-other-run';
   await expect(handlers.workspace_dev_cleanup({runId:s.run,confirm:true},s.clients)).rejects.toThrow(/identity/);
   await expect(handlers.workspace_dev_cleanup({runId:s.run,confirm:true},{...s.clients,connection:'stranger'})).rejects.toThrow(/does not exist/);
   expect(s.calls.filter(x=>x.path==='drive.files.update')).toHaveLength(0);
 });
 it('refuses tampered type tags, ownership or child parent before any trash write',async()=>{
    for(const mutate of [
      x=>{x.appProperties.rtc_kind='sheet';},
      x=>{x.owners=[{emailAddress:'foreign@example.test'}];},
      x=>{x.parents=['unrelated-folder'];}
    ]){
      const s=ready();await seeded(s);
      mutate(s.byId.get('d-1'));
      await expect(handlers.workspace_dev_cleanup({runId:s.run,confirm:true},s.clients)).rejects.toThrow(/identity/);
      expect(s.calls.filter(x=>x.path==='drive.files.update')).toHaveLength(0);
    }
  });
  it('refuses a missing recorded child before cleanup or any provider writes',async()=>{
    const s=ready();await seeded(s);
    const row=state.db.__state.devRuns.get(s.run);
    row.objects.splice(row.objects.findIndex(x=>x.kind==='sheet'),1);
    await expect(handlers.workspace_dev_cleanup({runId:s.run,confirm:true},s.clients)).rejects.toThrow(/ledger/);
    expect(s.calls.filter(x=>x.path==='drive.files.update')).toHaveLength(0);
  });
  it('marks partial failures as not confirmed and stops before parent',async()=>{
   const s=ready();await seeded(s);
   s.when('drive.files.update').resolves(({fileId,requestBody})=>{
     if(fileId!=='s-1')return {data:{id:fileId,trashed:false}};
     s.byId.set(fileId,{...s.byId.get(fileId),...requestBody});
     return {data:{id:fileId,trashed:true}};
   });
   const r=body(await handlers.workspace_dev_cleanup({runId:s.run,confirm:true},s.clients));
   expect(r.confirmed).toBe(false);
   expect(r.details.fullyCleaned).toBe(false);
   expect(s.calls.filter(x=>x.path==='drive.files.update').map(x=>x.args[0].fileId)).toEqual(['s-1','d-1']);
   expect(s.byId.get('f-root').trashed).toBe(false);
 });
 it('advertises required user confirmation and read-only refusal',()=>{
   const t=tools.find(t=>t.name==='workspace_dev_cleanup');
   expect(t.inputSchema.properties.confirm.type).toBe('boolean');
   expect(allowedTool(t.name,{profile:'read_only'})).toBe(false);
 });
});

describe('TEST-only fixture security boundary',()=>{
 it('refuses all provider reads and writes outside server-trusted TEST mode',async()=>{
   const {clients,calls}=makeFakeClients();clients.connection='owner-A';
   for(const rtcPolicy of [undefined,{mode:'live',profile:'full'},{mode:'production',profile:'full'},{profile:'full'}]){
     clients.rtcPolicy=rtcPolicy;
     await expect(handlers.workspace_dev_create_fixtures({scenario:'files',dryRun:true},clients)).rejects.toThrow(/non-production TEST/);
     await expect(handlers.workspace_dev_cleanup({runId:'4ab45b6c-013e-4f66-8c4a-ccccccccccca',confirm:true},clients)).rejects.toThrow(/non-production TEST/);
   }
   expect(calls).toEqual([]);
 });
});

describe('P8-7 reservation-first crash and replay safety',()=>{
 it('replay with the same runId never creates a fourth Google object',async()=>{
   const s=setup(),runId='42222222-3333-4444-8555-666666666666';
   const first=body(await handlers.workspace_dev_create_fixtures({scenario:'files',runId},s.clients));
   expect(first.confirmed).toBe(true);
   const second=body(await handlers.workspace_dev_create_fixtures({scenario:'files',runId},s.clients));
   expect(second.confirmed).toBe(true);
   expect(s.calls.filter(c=>c.path==='drive.files.create')).toHaveLength(3);
   expect((await state.db.getDevRun({runId,actingAs:s.clients.actingAs,connection:s.clients.connection})).steps.every(st=>st.state==='recorded')).toBe(true);
 });
 it('recovers a Google-created object when database recording failed without duplicating it',async()=>{
   const s=setup(),runId='42222222-3333-4444-8555-777777777777';
   const actual=state.db.recordDevObject.bind(state.db);
   let failed=false;
   state.db.recordDevObject=async input=>{if(!failed){failed=true;throw Error('lost database commit')}return actual(input);};
   await expect(handlers.workspace_dev_create_fixtures({scenario:'files',runId},s.clients)).rejects.toThrow(/incomplete or uncertain/);
   expect(s.calls.filter(c=>c.path==='drive.files.create')).toHaveLength(1);
   state.db.recordDevObject=actual;
   const recovered=body(await handlers.workspace_dev_create_fixtures({scenario:'files',runId},s.clients));
   expect(recovered.confirmed).toBe(true);
   expect(s.calls.filter(c=>c.path==='drive.files.create')).toHaveLength(3);
   expect(s.calls.some(c=>c.path==='drive.files.list'&&c.args[0].q.includes(runId))).toBe(true);
 });
 it('a provider timeout leaves a pending step and prevents blind retry or cleanup',async()=>{
   const s=setup(),runId='42222222-3333-4444-8555-888888888888';
   s.when('drive.files.create').rejects(Error('timeout after dispatch'));
   await expect(handlers.workspace_dev_create_fixtures({scenario:'files',runId},s.clients)).rejects.toThrow(/uncertain/);
   const calls=s.calls.filter(c=>c.path==='drive.files.create').length;
   await expect(handlers.workspace_dev_create_fixtures({scenario:'files',runId},s.clients)).rejects.toThrow(/pending/);
   expect(s.calls.filter(c=>c.path==='drive.files.create')).toHaveLength(calls);
   await expect(handlers.workspace_dev_cleanup({runId,confirm:true},s.clients)).rejects.toThrow();
   const runs=body(await handlers.workspace_dev_list_runs({},s.clients)).runs;
   expect(runs.find(r=>r.id===runId).pending).toBe(1);
 });
 it('foreign connection or changed root cannot hijack a reserved run',async()=>{
   const s=setup(),runId='42222222-3333-4444-8555-999999999999';
   await handlers.workspace_dev_create_fixtures({scenario:'files',runId},s.clients);
   await expect(handlers.workspace_dev_create_fixtures({scenario:'files',runId},{...s.clients,connection:'other'})).rejects.toThrow(/different account/);
   await expect(handlers.workspace_dev_create_fixtures({scenario:'files',runId,folder:'folder-other'},s.clients)).rejects.toThrow();
   expect(body(await handlers.workspace_dev_list_runs({}, {...s.clients,connection:'other'})).runs).toEqual([]);
 });
});

it('blocks legacy run without reservations rather than duplicating or blind-cleaning objects',async()=>{
 const s=setup(),runId='42222222-3333-4444-8555-aaaaaaaaaaaa';
 await state.db.startDevRun({id:runId,actingAs:s.clients.actingAs,connection:s.clients.connection,scenario:'files'});
 await state.db.recordDevObject({runId,actingAs:s.clients.actingAs,connection:s.clients.connection,kind:'folder',googleId:'old-folder'});
 await expect(handlers.workspace_dev_create_fixtures({scenario:'files',runId},s.clients)).rejects.toThrow(/Legacy fixture run/);
 await expect(handlers.workspace_dev_cleanup({runId,confirm:true},s.clients)).rejects.toThrow(/reservations/);
 expect(s.calls.filter(c=>c.path==='drive.files.create')).toHaveLength(0);
});

describe('P8-7 TEST Calendar event fixtures',()=>{
 const runId='55555555-2222-4444-8666-777777777777';
 const calendarId='owned-test-calendar';
 const args={scenario:'calendar',calendarId,runId};
 function cal(){
  const {clients,calls,when}=makeFakeClients();
  clients.connection='test-cal-connection';
  clients.rtcPolicy={mode:'test',profile:'full',areas:['workspace','calendar']};
  const byId=new Map();
  let n=0;
  when('calendar.calendarList.get').resolves({data:{id:calendarId,accessRole:'owner'}});
  when('calendar.events.insert').resolves(({requestBody})=>{
   const id='event-'+(++n);
   const event={...requestBody,id,creator:{email:clients.actingAs},status:'confirmed'};
   byId.set(id,event);return {data:event};
  });
  when('calendar.events.get').resolves(({eventId})=>({data:byId.get(eventId)||{}}));
  when('calendar.events.list').resolves(()=>({data:{items:[...byId.values()].filter(e=>e.extendedProperties?.private?.rtc_run===runId)}}));
  when('calendar.events.delete').resolves(({eventId})=>{byId.get(eventId).status='cancelled';return {data:{}};});
  return {clients,calls,when,byId};
 }
 it('previews without creating anything and rejects primary or reader calendars',async()=>{
  const s=cal();
  const preview=body(await handlers.workspace_dev_create_fixtures({...args,dryRun:true},s.clients));
  expect(preview.dryRun).toBe(true);
  expect(s.calls.some(c=>c.path==='calendar.events.insert')).toBe(false);
  await expect(handlers.workspace_dev_create_fixtures({...args,calendarId:'primary',dryRun:true},s.clients)).rejects.toThrow(/non-primary|separate test/);
  s.when('calendar.calendarList.get').resolves({data:{id:calendarId,accessRole:'reader'}});
  await expect(handlers.workspace_dev_create_fixtures({...args,dryRun:true},s.clients)).rejects.toThrow(/separately owned/);
  expect(s.calls.filter(c=>c.path==='calendar.events.insert')).toHaveLength(0);
 });
 it('creates one owned, private-tagged event with zero invites, and exact replay creates none',async()=>{
  const s=cal();
  const first=body(await handlers.workspace_dev_create_fixtures(args,s.clients));
  expect(first.confirmed).toBe(true);
  expect(first.details.objects).toHaveLength(1);
  const sent=s.calls.filter(c=>c.path==='calendar.events.insert');
  expect(sent).toHaveLength(1);
  expect(sent[0].args[0].sendUpdates).toBe('none');
  expect(sent[0].args[0].requestBody).toMatchObject({attendees:[],extendedProperties:{private:{rtc_run:runId,rtc_kind:'event'}}});
  const again=body(await handlers.workspace_dev_create_fixtures(args,s.clients));
  expect(again.confirmed).toBe(true);
  expect(s.calls.filter(c=>c.path==='calendar.events.insert')).toHaveLength(1);
 });
 it('recovers after successful Google insert but failed ledger recording, by exact event tags',async()=>{
  const s=cal();
  const original=state.db.recordDevObject.bind(state.db);
  let once=false;
  state.db.recordDevObject=async p=>{if(!once){once=true;throw Error('database write failed')}return original(p);};
  await expect(handlers.workspace_dev_create_fixtures(args,s.clients)).rejects.toThrow(/uncertain/);
  state.db.recordDevObject=original;
  const r=body(await handlers.workspace_dev_create_fixtures(args,s.clients));
  expect(r.confirmed).toBe(true);
  expect(s.calls.filter(c=>c.path==='calendar.events.list')).toHaveLength(1);
  expect(s.calls.filter(c=>c.path==='calendar.events.insert')).toHaveLength(1);
 });
 it('deletes only a verified event with confirmation and post-delete provider proof',async()=>{
  const s=cal();
  await handlers.workspace_dev_create_fixtures(args,s.clients);
  const p=body(await handlers.workspace_dev_cleanup({runId,dryRun:true},s.clients));
  expect(p.dryRun).toBe(true);
  expect(body(await handlers.workspace_dev_cleanup({runId},s.clients)).needsConfirmation).toBe(true);
  expect(s.calls.filter(c=>c.path==='calendar.events.delete')).toHaveLength(0);
  const cleaned=body(await handlers.workspace_dev_cleanup({runId,confirm:true},s.clients));
  expect(cleaned.confirmed).toBe(true);
  expect(cleaned.details.fullyCleaned).toBe(true);
  expect(s.calls.filter(c=>c.path==='calendar.events.delete')).toHaveLength(1);
  expect(s.byId.get('event-1').status).toBe('cancelled');
 });
 it('refuses event with changed run tag and never deletes a foreign event',async()=>{
  const s=cal();await handlers.workspace_dev_create_fixtures(args,s.clients);
  s.byId.get('event-1').extendedProperties.private.rtc_run='other-run';
  await expect(handlers.workspace_dev_cleanup({runId,confirm:true},s.clients)).rejects.toThrow(/tag|creator|run ID/);
  expect(s.calls.filter(c=>c.path==='calendar.events.delete')).toHaveLength(0);
 });
});

it('retries a Calendar cleanup after provider deletion without deleting any other event',async()=>{
 const {clients,calls,when}=makeFakeClients();
 clients.connection='test-cal-connection';
 clients.rtcPolicy={mode:'test',profile:'full',areas:['workspace','calendar']};
 const runId='55555555-2222-4444-8666-999999999999',calendarId='owned-test-calendar',eventId='already-gone';
 when('calendar.calendarList.get').resolves({data:{id:calendarId,accessRole:'owner'}});
 when('calendar.events.get').resolves({data:{id:eventId,status:'cancelled'}});
 const owner={actingAs:clients.actingAs,connection:clients.connection};
 await state.db.startDevRun({id:runId,...owner,scenario:'calendar',calendarId});
 await state.db.reserveDevStep({runId,...owner,kind:'event'});
 await state.db.recordDevObject({runId,...owner,kind:'event',googleId:eventId,parentId:calendarId});
 await state.db.markDevStepRecorded({runId,...owner,kind:'event',googleId:eventId});
 const r=body(await handlers.workspace_dev_cleanup({runId,confirm:true},clients));
 expect(r.confirmed).toBe(true);
 expect(calls.filter(c=>c.path==='calendar.events.delete')).toHaveLength(0);
 expect((await state.db.getDevRun({runId,...owner})).objects[0].cleaned_at).toBeTruthy();
});

describe('P8-7 independently bound Calendar ledger ID evidence',()=>{
 const runId='77777777-2222-4444-8666-555555555555';
 const calendarId='owned-test-calendar';
 const googleId='owned-event-1';
 function prepare(){
   const {clients,calls,when}=makeFakeClients();
   clients.connection='test-calendar-exact-id';
   clients.rtcPolicy={mode:'test',profile:'full',areas:['workspace','calendar']};
   when('calendar.calendarList.get').resolves({data:{id:calendarId,accessRole:'owner',primary:false}});
   const identity={actingAs:clients.actingAs,connection:clients.connection};
   const event={id:googleId,creator:{email:clients.actingAs},status:'confirmed',
     extendedProperties:{private:{rtc_run:runId,rtc_kind:'event'}}};
   when('calendar.events.get').resolves({data:event});
   const seed=async()=>{
     await state.db.startDevRun({id:runId,...identity,scenario:'calendar',calendarId});
     await state.db.reserveDevStep({runId,...identity,kind:'event'});
     await state.db.recordDevObject({runId,...identity,kind:'event',googleId,parentId:calendarId});
     await state.db.markDevStepRecorded({runId,...identity,kind:'event',googleId});
     return state.db.getDevRun({runId,...identity});
   };
   return {clients,calls,when,identity,event,seed};
 }
 it('rejects another provider event ID even if run tags and creator are identical',async()=>{
   const s=prepare();const run=await s.seed();
   s.when('calendar.events.get').resolves({data:{...s.event,id:'foreign-event'}});
   expect(()=>exactCalendarEvent({...s.event,id:'foreign-event'},runId,s.identity,googleId)).toThrow(/tag|creator|run ID/);
   expect((await calendarReadback(s.clients,s.identity,runId)).verified).toBe(false);
   await expect(inspectCalendarCleanup(run,s.clients,s.identity)).rejects.toThrow(/different event ID/);
   await expect(handlers.workspace_dev_cleanup({runId,confirm:true},s.clients)).rejects.toThrow(/different event ID/);
   expect(s.calls.filter(x=>x.path==='calendar.events.delete')).toHaveLength(0);
   expect((await state.db.getDevRun({runId,...s.identity})).objects[0].cleaned_at).toBeFalsy();
 });
 it('never trusts a cancelled tombstone for an unrelated event',async()=>{
   const s=prepare();const run=await s.seed();
   s.when('calendar.events.get').resolves({data:{id:'foreign-event',status:'cancelled'}});
   await expect(inspectCalendarCleanup(run,s.clients,s.identity)).rejects.toThrow(/different event ID/);
   await expect(handlers.workspace_dev_cleanup({runId,confirm:true},s.clients)).rejects.toThrow(/different event ID/);
   expect(s.calls.filter(x=>x.path==='calendar.events.delete')).toHaveLength(0);
 });
 it('requires an exact tombstone after deleting the recorded event before marking cleanup',async()=>{
   const s=prepare();const run=await s.seed();
   let gets=0;
   s.when('calendar.events.get').resolves(()=>{
     gets++;
     return {data:gets===1?s.event:{id:'foreign-event',status:'cancelled'}};
   });
   s.when('calendar.events.delete').resolves({data:{}});
   const result=await deleteRecordedCalendarFixture(run,s.clients,s.identity);
   expect(result.fullyCleaned).toBe(false);
   expect(result.failures).toHaveLength(1);
   expect(s.calls.filter(x=>x.path==='calendar.events.delete').map(x=>x.args[0].eventId)).toEqual([googleId]);
   expect((await state.db.getDevRun({runId,...s.identity})).objects[0].cleaned_at).toBeFalsy();
 });
 it('requires exact event ID on the independent final cleanup verification',async()=>{
   const s=prepare();const run=await s.seed();
   await state.db.markDevObjectCleaned({runId,...s.identity,kind:'event',googleId});
   s.when('calendar.events.get').resolves({data:{id:'foreign-event',status:'cancelled'}});
   const result=await confirmCalendarGone(run,s.clients,s.identity);
   expect(result.allTrashed).toBe(false);
   expect(result.deleted).toBe(false);
 });
 it('rejects mismatched provider ID on a recorded reservation replay without new writes',async()=>{
   const s=prepare();await s.seed();
   s.when('calendar.events.get').resolves({data:{...s.event,id:'foreign-event'}});
   await expect(handlers.workspace_dev_create_fixtures({scenario:'calendar',calendarId,runId},s.clients))
     .rejects.toThrow(/uncertain/);
   expect(s.calls.filter(x=>x.path==='calendar.events.insert')).toHaveLength(0);
 });
});
