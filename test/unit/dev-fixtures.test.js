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

describe('P8-7 precise confirmed cleanup',()=>{
 function ready(){
   const {clients,calls,when}=makeFakeClients();clients.connection='owner-A';
   const byId=new Map();
   const run='4ab45b6c-013e-4f66-8c4a-ccccccccccca';
   const objects=[['folder','f-root','application/vnd.google-apps.folder'],['doc','d-1','application/vnd.google-apps.document'],['sheet','s-1','application/vnd.google-apps.spreadsheet']];
   const owner={emailAddress:clients.actingAs};
   for(const [kind,id,mimeType] of objects)byId.set(id,{id,mimeType,appProperties:{rtc_run:run},owners:[owner],trashed:false});
   byId.set('sibling',{id:'sibling',mimeType:'application/vnd.google-apps.document',appProperties:{},owners:[owner],trashed:false});
   when('drive.files.get').resolves(({fileId})=>({data:{...byId.get(fileId)}}));
   when('drive.files.update').resolves(({fileId,requestBody})=>{byId.set(fileId,{...byId.get(fileId),...requestBody});return {data:{id:fileId,trashed:true}};});
   return {clients,calls,when,byId,run,objects,owner};
 }
 async function seeded(s){
   await state.db.startDevRun({id:s.run,actingAs:s.clients.actingAs,connection:s.clients.connection,scenario:'files'});
   for(const [kind,googleId] of s.objects)await state.db.recordDevObject({runId:s.run,actingAs:s.clients.actingAs,connection:s.clients.connection,kind,googleId});
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
