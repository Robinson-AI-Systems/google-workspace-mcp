// Frozen P10-B criterion accounting is content-only here: CI checkouts can be
// shallow. The planning SHA parent/ancestry check belongs to the full clone's
// npm run session:bundle -- --planned-at ... --report ... command.
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {readBundlePlan,assessBundleDelivery} from '../../scripts/bundle-plan.mjs';
const plan=readBundlePlan(readFileSync(new URL('../../docs/pr-cards/P10-DUAL-IDENTITY.md',import.meta.url),'utf8'));
const delivery=JSON.parse(readFileSync(new URL('../../docs/plan/evidence/p10-bundle-delivery.json',import.meta.url),'utf8'));
describe('P10 B original frozen engineering acceptance completeness',()=>{
 it('counts three whole approved cards with exact nonempty criterion evidence',()=>{
   expect(plan.baseRevision).toBe('c6f64546214946a55f7355146f68bed220b906eb');
   expect(delivery.plannedAt).toBe('6ce201207552e628d96cacedb8c8aa626120fded');
   const result=assessBundleDelivery(plan,delivery);
   expect(result.status).toBe('SCOPE_ACCOUNTING_CHECKED');
   expect(result.plannedSubsections).toEqual(['P10-1','P10-2','P10-3']);
   expect(delivery.subsections.every(row=>row.remainingEngineering.length===0)).toBe(true);
 });
});
