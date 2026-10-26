#!/usr/bin/env node
// Check the bounded P11-1 reference snapshot against the actual assembled runtime registry.
// This does not connect to Google or certify provider parity.
import { readFileSync } from 'node:fs';
import { inspectProviderInventory } from '../src/provider-inventory.js';
process.env.DATABASE_URL ||= 'postgres://inventory:inventory@localhost/unused';
const { registry } = await import('../src/tools/index.js');
const baseline = JSON.parse(readFileSync(new URL('../docs/plan/operations-baseline.json', import.meta.url), 'utf8'));
const result = inspectProviderInventory(baseline, registry.tools.map((tool) => tool.name));
if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  for (const family of result.families) {
    console.log(family.api + '/' + family.version
      + ': ' + family.recordedOperations + ' declared; '
      + family.source.mapped + ' registered; '
      + family.liveVerified + ' separately verified live in this snapshot.');
  }
  console.log('Partial inventory: ' + result.referenceMethods
    + ' reference methods; ' + result.registryToolsNotYetReconciled
    + ' registry tools not yet reconciled with these two family snapshots. No coverage percentage.');
}
if (!result.ok) {
  for (const message of result.problems) console.error('P11-1 inventory: ' + message);
  process.exitCode = 1;
}
