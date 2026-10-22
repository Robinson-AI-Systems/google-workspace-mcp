import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inspectProviderInventory } from '../../src/provider-inventory.js';

const baseline = JSON.parse(readFileSync(new URL('../../docs/plan/operations-baseline.json', import.meta.url), 'utf8'));
const clone = () => structuredClone(baseline);
const toolNames = baseline.families.flatMap((family) => family.operations.map((op) => op.tool));

describe('P11-1 provider method inventory foundation', () => {
  it('accepts the explicit PARTIAL pinned Tasks and licensing snapshot', () => {
    const report = inspectProviderInventory(baseline, toolNames);
    expect(report.ok).toBe(true);
    expect(report.partial).toBe(true);
    expect(report.referenceMethods).toBe(21);
    expect(report.linkedRegistryTools).toBe(21);
    expect(report.families.every((family) => family.liveVerified === 0)).toBe(true);
    expect(report.caveat).toMatch(/Do not compute/);
  });

  it('fails closed on missing official method row', () => {
    const data = clone();
    data.families[0].operations.shift();
    const result = inspectProviderInventory(data, toolNames);
    expect(result.ok).toBe(false);
    expect(result.problems.some((value) => value.includes('Missing reference operation'))).toBe(true);
  });

  it('rejects duplicate row and duplicate reference ID', () => {
    const data = clone();
    data.families[0].operations.push(structuredClone(data.families[0].operations[0]));
    data.families[0].referenceMethodIds.push(data.families[0].referenceMethodIds[0]);
    const result = inspectProviderInventory(data, toolNames);
    expect(result.problems.some((value) => value.includes('Duplicate operation row'))).toBe(true);
    expect(result.problems.some((value) => value.includes('Duplicate reference method'))).toBe(true);
  });

  it('rejects an invented or unregistered mapped handler', () => {
    const data = clone();
    data.families[0].operations[0].tool = 'never_registered_method';
    const result = inspectProviderInventory(data, toolNames);
    expect(result.ok).toBe(false);
    expect(result.problems.some((value) => value.includes('no registered tool'))).toBe(true);
  });

  it('refuses unpinned operations and a new family declared without a method list', () => {
    const data = clone();
    data.families[0].operations[0].method = 'tasklists.nonexistent';
    const result = inspectProviderInventory(data, toolNames);
    expect(result.problems.some((value) => value.includes('Unknown/unpinned operation'))).toBe(true);
    expect(result.problems.some((value) => value.includes('Missing reference operation'))).toBe(true);
    const other = clone();
    other.families.push({ api: 'new_api', version: 'v1', reference: 'https://example.com', checkedOn: '2026-10-21', referenceMethodIds: [], operations: [] });
    expect(inspectProviderInventory(other, toolNames).ok).toBe(false);
  });

  it('will not treat registered tool existence as live provider verification', () => {
    const data = clone();
    const op = data.families[0].operations[0];
    op.liveStatus = 'verified';
    expect(inspectProviderInventory(data, toolNames).problems.some((value) => value.includes('without exact revision'))).toBe(true);
    op.liveRevision = '706494bda986af080e54d34aa51e799167126647';
    op.liveEvidence = 'docs/plan/evidence/specific-google-provider-proof.json';
    expect(inspectProviderInventory(data, toolNames).ok).toBe(true);
    op.liveStatus = 'unverified';
    expect(inspectProviderInventory(data, toolNames).ok).toBe(false);
  });

  it('rejects unsupported methods without disposition evidence and missing authority', () => {
    const data = clone();
    const op = data.families[0].operations[0];
    op.sourceStatus = 'provider_unavailable';
    op.tool = null;
    op.roleOrEntitlement = '';
    const result = inspectProviderInventory(data, toolNames);
    expect(result.problems.some((value) => value.includes('Provider-unavailable method requires'))).toBe(true);
    expect(result.problems.some((value) => value.includes('Missing authority assessment'))).toBe(true);
  });

  it('reports methods still unreconciled without inventing a coverage percentage', () => {
    const result = inspectProviderInventory(baseline, [...toolNames, 'some_other_google_tool']);
    expect(result.ok).toBe(true);
    expect(result.registryToolsNotYetReconciled).toBe(1);
    expect(result.nextUnlinkedToolNames).toContain('some_other_google_tool');
    expect(JSON.stringify(result)).not.toMatch(/coveragePercent/);
  });

  it('requires an explicit incomplete inventory status', () => {
    const data = clone();
    data.complete = true;
    expect(inspectProviderInventory(data, toolNames).ok).toBe(false);
  });
});
