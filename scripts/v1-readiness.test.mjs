import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assessV1 } from './v1-readiness.mjs';
import { readFileSync } from 'node:fs';
const manifest=JSON.parse(readFileSync(new URL('../docs/plan/v1-release-gates.json',import.meta.url),'utf8'));
const ids=[...manifest.mandatoryAcceptanceIds,...Object.keys(manifest.deferredAcceptance)];
const row=id=>({id,status:'PENDING',dependsOn:[]});
const rows=ids.map(row);
const sha='a'.repeat(40);
const ready={main:sha,live:sha,deployed:sha,state:'READY'};
test('fails closed while original security and multi-user acceptance are PENDING',()=>{
 const r=assessV1(manifest,rows,ready);
 assert.equal(r.status,'BLOCKED');
 assert.equal(r.pendingMandatory.length,6);
 assert.equal(r.excludedPending.length,2);
});
test('unmatched or unproven live source never clears the gate',()=>{
 const accepted=rows.map(x=>({...x,status:'PASSED'}));
 assert.equal(assessV1(manifest,accepted).status,'BLOCKED');
 assert.equal(assessV1(manifest,accepted,{...ready,deployed:'b'.repeat(40)}).status,'BLOCKED');
 assert.equal(assessV1(manifest,accepted,{...ready,state:'ERROR'}).status,'BLOCKED');
});
test('explicitly excluded paid and delegation acceptance remain visible rather than PASSED',()=>{
 const accepted=rows.map(x=>({...x,status:manifest.mandatoryAcceptanceIds.includes(x.id)?'PASSED':'PENDING'}));
 const result=assessV1(manifest,accepted,ready);
 assert.equal(result.status,'PREFLIGHT_CLEAR_NOT_LIVE_ATTESTATION');
 assert.deepEqual(result.excludedPending,Object.keys(manifest.deferredAcceptance));
 assert.match(result.cannotInfer,/No release or enrollment permission/);
});
test('newly pending unclassified task blocks release instead of disappearing',()=>{
 const accepted=rows.map(x=>({...x,status:manifest.mandatoryAcceptanceIds.includes(x.id)?'PASSED':'PENDING'}));
 const result=assessV1(manifest,[...accepted,row('NEW-PROVIDER-SECURITY')],ready);
 assert.equal(result.status,'BLOCKED');
 assert.deepEqual(result.newlyPendingUnclassified,['NEW-PROVIDER-SECURITY']);
});
test('mandatory dependencies remain mandatory even when separately deferred',()=>{
 const accepted=rows.map(x=>({...x,status:manifest.mandatoryAcceptanceIds.includes(x.id)?'PASSED':'PENDING'}));
 accepted.find(x=>x.id==='P10-MCP-PILOT').dependsOn=['P10-CUSTOMER-DELEGATION'];
 const result=assessV1(manifest,accepted,ready);
 assert.equal(result.status,'BLOCKED');
 assert.deepEqual(result.missingDependencyPasses,[{id:'P10-MCP-PILOT',dependency:'P10-CUSTOMER-DELEGATION'}]);
});
test('unknown or duplicated classification fails instead of bypassing ledger',()=>{
 assert.throws(()=>assessV1({...manifest,mandatoryAcceptanceIds:['GHOST']},rows,ready),/Unknown/);
 assert.throws(()=>assessV1({...manifest,mandatoryAcceptanceIds:[ids[0],ids[0]]},rows,ready),/Duplicate/);
});
