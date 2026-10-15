import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createFakeDb} from '../helpers/fake-db.js';
const ref=vi.hoisted(()=>({db:null}));
vi.mock('../../src/db.js',async load=>{const real=await load();return Object.fromEntries(Object.keys(real).map(k=>[k,(...args)=>ref.db[k](...args)]));});
const {fixtureIntent,describeFixtureRun,inspectFixtureRun}=await import('../../src/tools/dev-run-state.js');
const {registry}=await import('../../src/tools/index.js');
const {toolMetadata,allowedTool}=await import('../../src/rtc/catalog.js');
const runId='92222222-3333-4444-8555-666666666666';
const clients={actingAs:'owner@example.test',connection:'owner',rtcPolicy:{mode:'test',profile:'full'}};
const identity={actingAs:clients.actingAs,connection:clients.connection};
beforeEach(()=>{ref.db=createFakeDb();});
describe('P8-7 immutable recoverable fixture intent',()=>{
 it('rejects changed creation intent on the same run before any new reservation',async()=>{
  const requestSpec=fixtureIntent({scenario:'calendar',calendarId:'owned-calendar',startAt:'2027-01-01T12:00:00Z'});
  const base={id:runId,...identity,scenario:'calendar',calendarId:'owned-calendar',requestSpec};
  await ref.db.startDevRun(base);
  await expect(ref.db.startDevRun({...base,requestSpec:{...requestSpec,startAt:'2027-01-02T12:00:00.000Z'}})).rejects.toThrow(/immutable/);
  expect((await ref.db.getDevRun({runId,...identity})).steps).toEqual([]);
  await expect(ref.db.startDevRun({...base,requestSpec:{...requestSpec}})).resolves.toMatchObject({created:false});
 });
 it('exposes pending, recorded and cleaned states only to its TEST connection without claiming provider proof',async()=>{
  await ref.db.startDevRun({id:runId,...identity,scenario:'calendar',calendarId:'owned-calendar',requestSpec:fixtureIntent({scenario:'calendar',calendarId:'owned-calendar'})});
  await ref.db.reserveDevStep({runId,...identity,kind:'event'});
  const read=async()=>JSON.parse((await inspectFixtureRun({runId},clients)).content[0].text);
  expect(await read()).toMatchObject({state:'needs_reconciliation',providerVerified:false,slots:[{kind:'event',state:'pending'}]});
  await ref.db.recordDevObject({runId,...identity,kind:'event',googleId:'exact',parentId:'owned-calendar'});
  expect(await read()).toMatchObject({state:'needs_reconciliation',slots:[{kind:'event',state:'pending',id:'exact'}]});
  await ref.db.markDevStepRecorded({runId,...identity,kind:'event',googleId:'exact'});
  expect(await read()).toMatchObject({state:'recorded',slots:[{id:'exact',parentId:'owned-calendar'}]});
  await ref.db.markDevObjectCleaned({runId,...identity,kind:'event',googleId:'exact'});
  expect(await read()).toMatchObject({state:'cleaned',recovery:{mayReplayCreation:false}});
  await expect(inspectFixtureRun({runId},{...clients,connection:'foreign'})).rejects.toThrow(/not_found/);
  await expect(inspectFixtureRun({runId},{...clients,actingAs:'foreign@example.test'})).rejects.toThrow(/not_found/);
  await expect(inspectFixtureRun({runId},{...clients,rtcPolicy:{mode:'production'}})).rejects.toThrow(/TEST/);
  expect(toolMetadata(registry.tools.find(t=>t.name==='workspace_dev_get_run')).annotations.readOnlyHint).toBe(true);
  expect(allowedTool('workspace_dev_get_run',{profile:'read_only',areas:['workspace']})).toBe(true);
 });
 it('refuses conflicting reservation/object/parent evidence and preserves legacy recovery gate',()=>{
  const base={id:runId,scenario:'calendar',calendar_id:'owned',request_spec:{},objects:[{kind:'event',google_id:'exact',parent_id:'owned'}],steps:[{kind:'event',state:'recorded',google_id:'exact'}]};
  for(const changed of [{...base,steps:[{kind:'event',state:'recorded',google_id:'foreign'}]},
   {...base,objects:[{kind:'event',google_id:'exact',parent_id:'foreign'}]},
   {...base,objects:[...base.objects,...base.objects]}, {...base,steps:[]}])expect(()=>describeFixtureRun(changed)).toThrow();
  expect(describeFixtureRun({...base,request_spec:null,steps:[]})).toMatchObject({state:'legacy_needs_review',recovery:{mayReplayCreation:false}});
 });
});
