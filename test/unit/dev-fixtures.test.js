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
const body=r=>JSON.parse(r.content[0].text);
beforeEach(()=>{state.db=createFakeDb();});
function setup(){
 const {clients,calls,when}=makeFakeClients();
 clients.connection='owner-A';
 let n=0;const byId=new Map();
 when('drive.files.create').resolves(({requestBody})=>{
   const id='fixture'+(++n);
   const value={id,...requestBody,trashed:false};
   byId.set(id,value);
   return {data:value};
 });
 when('drive.files.get').resolves(({fileId})=>({data:byId.get(fileId)||{}}));
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
 it('is a write forbidden to read-only and everyday Workspace profiles',()=>{
   expect(tools[0].inputSchema.properties.dryRun).toBeDefined();
   expect(isWrite('workspace_dev_create_fixtures')).toBe(true);
   expect(allowedTool('workspace_dev_create_fixtures',{profile:'read_only'})).toBe(false);
   expect(allowedTool('workspace_dev_create_fixtures',{profile:'everyday'})).toBe(false);
 });
});
