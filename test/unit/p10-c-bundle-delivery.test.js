import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readBundlePlan,assessBundleDelivery} from '../../scripts/bundle-plan.mjs';
const plan=readBundlePlan(readFileSync(new URL('../../docs/pr-cards/P10-ISOLATED-USERS.md',import.meta.url),'utf8'));
const delivery=JSON.parse(readFileSync(new URL('../../docs/plan/evidence/p10-c-bundle-delivery.json',import.meta.url),'utf8'));
describe('P10 C: complete frozen P10-4/P10-5 original criterion delivery',()=>{
 it('retains the pre-work plan and maps all 8 original criteria to actual source and tests',()=>{
  expect(plan.baseRevision).toBe('eece407e5f8e2a2094793355e9a5ca086567e5c1');
  expect(delivery.plannedAt).toBe('e4dccbc0e586d6674ec636e30f18ef802ed599f9');
  const result=assessBundleDelivery(plan,delivery);
  expect(result.status).toBe('SCOPE_ACCOUNTING_CHECKED');
  expect(result.plannedSubsections).toEqual(['P10-4','P10-5']);
  expect(delivery.subsections.every(row=>row.remainingEngineering.length===0&&row.criteria.every(c=>c.evidence.length>100))).toBe(true);
 });
});
