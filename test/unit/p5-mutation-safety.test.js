import {beforeEach,describe,it,expect,vi} from 'vitest';
import {createFakeDb} from '../helpers/fake-db.js';
import {makeFakeClients} from '../helpers/fake-google.js';
const context=vi.hoisted(()=>({db:null}));
vi.mock('../../src/db.js',async(importActual)=>{
 const actual=await importActual();
 return Object.fromEntries(Object.keys(actual).map(k=>[k,(...args)=>context.db[k](...args)]));
});
const {registry}=await import('../../src/tools/index.js');
const {isWrite,allowedTool}=await import('../../src/rtc/catalog.js');
const {isGuardedWrite}=await import('../../src/tools/write.js');
const {GUARDS}=await import('../../src/tools/guards.js');
const parsed=r=>JSON.parse(r.content[0].text);
const targetNames=['gmail_untrash_message','gmail_untrash_thread','sheets_duplicate_sheet','sheets_format_cells','sheets_freeze_rows',
 'sheets_autoresize_columns','sheets_sort_range','sheets_merge_cells','sheets_unmerge_cells','sheets_protect_range','domain_confirm_verification'];
const args={
 gmail_untrash_message:{messageId:'m1'},gmail_untrash_thread:{threadId:'t1'},
 sheets_duplicate_sheet:{spreadsheetId:'s1',sheetId:1,newSheetName:'Copy'},
 sheets_format_cells:{spreadsheetId:'s1',sheetId:1,startRow:0,endRow:1,startColumn:0,endColumn:1,format:{textFormat:{bold:true}}},
 sheets_freeze_rows:{spreadsheetId:'s1',sheetId:1,frozenRowCount:1,frozenColumnCount:0},
 sheets_autoresize_columns:{spreadsheetId:'s1',sheetId:1,startColumn:0,endColumn:1},
 sheets_sort_range:{spreadsheetId:'s1',sheetId:1,startRow:0,endRow:2,startColumn:0,endColumn:1,sortColumnIndex:0},
 sheets_merge_cells:{spreadsheetId:'s1',sheetId:1,startRow:0,endRow:2,startColumn:0,endColumn:2},
 sheets_unmerge_cells:{spreadsheetId:'s1',sheetId:1,startRow:0,endRow:2,startColumn:0,endColumn:2},
 sheets_protect_range:{spreadsheetId:'s1',sheetId:1,startRow:0,endRow:2,startColumn:0,endColumn:2,warningOnly:true},
 domain_confirm_verification:{domainName:'example.test'}
};
beforeEach(()=>{context.db=createFakeDb();});
const seeded=()=>{
 const {clients,calls,when}=makeFakeClients();
 clients.connection='conn1';clients.allowedDomains=['example.test'];clients.rtcPolicy={profile:'full'};
 when('gmail.users.messages.get').resolves({data:{id:'m1',labelIds:['INBOX']}});
 when('gmail.users.threads.get').resolves({data:{id:'t1',messages:[{labelIds:['INBOX']}]}});
 when('sheets.spreadsheets.get').resolves({data:{sheets:[{properties:{sheetId:1,title:'Tab',gridProperties:{frozenRowCount:1,frozenColumnCount:0}},
  merges:[{sheetId:1,startRowIndex:0,endRowIndex:2,startColumnIndex:0,endColumnIndex:2}],
  protectedRanges:[{range:{sheetId:1,startRowIndex:0,endRowIndex:2,startColumnIndex:0,endColumnIndex:2},warningOnly:true}],
  data:[{columnMetadata:[{pixelSize:150}],rowData:[{values:[{userEnteredFormat:{textFormat:{bold:true}}}]}]}]}]}});
 when('sheets.spreadsheets.values.get').resolves({data:{values:[['a'],['b']]}});
 when('sheets.spreadsheets.batchUpdate').resolves({data:{replies:[{duplicateSheet:{properties:{sheetId:2}}}]}});
 when('siteVerification.webResource.list').resolves({data:{items:[{site:{identifier:'example.test'}}]}});
 return {clients,calls,when};
};
describe('P5-1 semantic mutation guard coverage',()=>{
 it('eleven uncovered operations are classified as changing and have genuine guarded handlers',()=>{
  for(const name of targetNames){
   expect(GUARDS[name],name).toBeDefined();
   expect(isWrite(name),name).toBe(true);
   expect(isGuardedWrite(registry.handlers[name]),name).toBe(true);
   expect(registry.tools.find(t=>t.name===name).inputSchema.properties.dryRun.type).toBe('boolean');
  }
 });
 it('a fabricated dryRun input field does not establish actual handler provenance',()=>{
  const falseHandler=async()=>({content:[]});
  falseHandler.inputSchema={properties:{dryRun:{type:'boolean'}}};
  expect(isGuardedWrite(falseHandler)).toBe(false);
 });
 it('preview of all eleven reads only, and no provider mutations occur',async()=>{
  const {clients,calls}=seeded();
  for(const name of targetNames){
    const r=parsed(await registry.handlers[name]({...args[name],dryRun:true},clients));
    expect(r.dryRun,name).toBe(true);
    expect(r.done,name).toBe(false);
  }
  const mutated=calls.filter(c=>/\.(update|insert|patch|send|untrash|batchUpdate|delete)$/.test(c.path));
  expect(mutated).toEqual([]);
 });
 it('high impact changes need confirmation, and read_only profiles refuse every one',async()=>{
  const {clients,calls}=seeded();
  const destructive=['sheets_format_cells','sheets_sort_range','sheets_merge_cells','sheets_protect_range'];
  for(const name of destructive){
   const r=parsed(await registry.handlers[name](args[name],clients));
   expect(r.needsConfirmation,name).toBe(true);
  }
  expect(calls.filter(c=>/\.(batchUpdate|untrash|insert)$/.test(c.path))).toEqual([]);
  for(const name of targetNames)expect(allowedTool(name,{profile:'read_only'}),name).toBe(false);
 });
 it('Gmail restore readback confirms only after the TRASH label is absent',async()=>{
   const {clients,when}=seeded();
   expect(parsed(await registry.handlers.gmail_untrash_message(args.gmail_untrash_message,clients)).confirmed).toBe(true);
   expect(parsed(await registry.handlers.gmail_untrash_thread(args.gmail_untrash_thread,clients)).confirmed).toBe(true);
   when('gmail.users.messages.get').resolves({data:{id:'m1',labelIds:['TRASH']}});
   expect(parsed(await registry.handlers.gmail_untrash_message(args.gmail_untrash_message,clients)).confirmed).toBe(false);
 });
 it('domain verification stays within allowed business domains and reads Google verification',async()=>{
   const {clients,calls}=seeded();
   const denied=await registry.handlers.domain_confirm_verification({domainName:'elsewhere.test'},clients);
   expect(denied.content[0].text).toContain('outside');
   expect(calls.some(c=>c.path==='siteVerification.webResource.insert')).toBe(false);
   const verified=parsed(await registry.handlers.domain_confirm_verification(args.domain_confirm_verification,clients));
   expect(verified.confirmed).toBe(true);
 });
 it('audit failure never reports verified success after provider mutation',async()=>{
   const {clients,calls}=seeded();
   context.db.recordChange=async()=>{throw Error('database unavailable');};
   const err=vi.spyOn(console,'warn').mockImplementation(()=>{});
   const r=parsed(await registry.handlers.gmail_untrash_message(args.gmail_untrash_message,clients));
   err.mockRestore();
   expect(calls.some(c=>c.path==='gmail.users.messages.untrash')).toBe(true);
   expect(r).toMatchObject({done:true,confirmed:false,logged:false,auditFailure:true});
 });
});
