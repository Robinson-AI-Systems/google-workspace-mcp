import {describe,it,expect} from 'vitest';
import {registry} from '../../src/tools/index.js';
import {OUTPUT_SCHEMAS,attachStructuredResult} from '../../src/rtc/structured.js';
import {ok} from '../../src/tools/util.js';
import {makeFakeClients} from '../helpers/fake-google.js';
import {listedTools} from '../../src/rtc/catalog.js';
const targets=Object.keys(OUTPUT_SCHEMAS);
describe('P8-1 typed MCP workflow outputs',()=>{
 it('declares full machine-readable schemas for each supported JSON workflow',()=>{
   for(const name of targets){
     const tool=registry.tools.find(x=>x.name===name);
     expect(tool?.outputSchema,name).toEqual(OUTPUT_SCHEMAS[name]);
     expect(tool.outputSchema.type).toBe('object');
     expect(tool.outputSchema.anyOf[0].required.length).toBeGreaterThan(1);
   }
 });
 it('keeps compact listing budget small without hiding full discoverable schemas',()=>{
   const compact=listedTools(registry.tools,{profile:'full'},'compact');
   for(const name of ['workflow_security_snapshot','workflow_audit_external_sharing']){
     expect(compact.find(x=>x.name===name).outputSchema).toBeUndefined();
     expect(registry.tools.find(x=>x.name===name).outputSchema).toBeDefined();
   }
 });
 it('attaches exact structured content to security snapshots and sharing audits',async()=>{
   const {clients}=makeFakeClients();clients.connection='c1';
   const security=await registry.handlers.workflow_security_snapshot({},clients);
   const content=JSON.parse(security.content[0].text);
   expect(security.structuredContent).toEqual(content);
   expect(security.structuredContent.totalUsers).toBe(0);
   const sharing=await registry.handlers.workflow_audit_external_sharing({},clients);
   expect(sharing.structuredContent).toMatchObject({scanned:0,filesWithExternalOrPublicSharing:[]});
 });
 it('does not attach structured content to error or unregistered results',()=>{
   const bad={...ok('Access denied.'),isError:true};
   expect(attachStructuredResult('workflow_security_snapshot',bad)).toBe(bad);
   const raw=ok({anything:'anything'});
   expect(attachStructuredResult('drive_get_file',raw)).toBe(raw);
 });
 it('uses the bounded handle instead of full original body when output is large',()=>{
   const h='rtc_result_'+'a'.repeat(32);
   const result=attachStructuredResult('workflow_security_snapshot',ok({handle:h,bytes:90000,count:200,summary:'Stored for 24 hours',preview:'short'}));
   expect(result.structuredContent).toMatchObject({handle:h,bytes:90000});
   expect(JSON.stringify(result.structuredContent)).not.toContain('private content');
 });
 it('fails closed on a workflow that returns invalid JSON or incompatible fields',()=>{
   const invalid=attachStructuredResult('workflow_security_snapshot',ok('not json'));
   expect(invalid.isError).toBe(true);
   const malformed=attachStructuredResult('workflow_security_snapshot',ok({totalUsers:'several'}));
   expect(malformed.isError).toBe(true);
   expect(JSON.stringify(malformed)).not.toContain('several');
 });
 it('preserves read-only workflow error responses without fabricated readiness',()=>{
   const invalid=attachStructuredResult('workspace_dev_check_integration',{...ok({status:'ready'}),isError:true});
   expect(invalid.structuredContent).toBeUndefined();
 });
});
