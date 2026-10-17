// Freeze-aware bundle accounting run under standard CI, not a substituted acceptance claim.
import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {verifyFrozenPlan,assessBundleDelivery} from '../../scripts/bundle-plan.mjs';
const card='docs/plan/designs/USER-AUTHORITY-AND-PARALLEL-SIGNIN.md';
const planning='4ffaeed879f474d539593942b4eb5785e58a0cc5';
const report=JSON.parse(readFileSync(new URL('../../docs/plan/evidence/p9-bundle-delivery.json',import.meta.url),'utf8'));
describe('P9 one-bundle frozen outcome and criterion evidence',()=>{
 it('keeps the full immutable plan, direct main parent and explicit complete acceptance evidence',()=>{
  const plan=verifyFrozenPlan(process.cwd(),card,planning);
  const result=assessBundleDelivery(plan,report);
  expect(result.status).toBe('SCOPE_ACCOUNTING_CHECKED');
  expect(result.plannedSubsections).toEqual(['P9-1','P9-2','P9-3','P9-4']);
  expect(report.subsections.every(x=>x.remainingEngineering.length===0)).toBe(true);
 });
});
