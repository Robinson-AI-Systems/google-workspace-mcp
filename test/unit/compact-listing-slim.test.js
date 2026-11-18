// The compact listing keeps field names, types, choices and required markers
// but drops explanation text inside input fields; describe returns it all.
import { describe, it, expect } from 'vitest';
import { registry } from '../../src/tools/index.js';
import { listedTools, RTC_META } from '../../src/rtc/catalog.js';

const fieldDescriptions = s => JSON.stringify(s).match(/"description":"/g)?.length ?? 0;
const shape = v => Array.isArray(v) ? v.map(shape) : v && typeof v === 'object'
  ? Object.fromEntries(Object.entries(v).filter(([k, x]) => !(k === 'description' && typeof x === 'string')).map(([k, x]) => [k, shape(x)])) : v;

describe('compact listing', () => {
  const compact = listedTools(registry.tools, { profile: 'full', listing: 'compact' });
  const full = name => registry.tools.find(t => t.name === name);

  it('keeps every field, type, choice list and required marker of every listed tool', () => {
    for (const t of compact) expect(t.inputSchema ? t.inputSchema : null).toEqual(full(t.name).inputSchema ? (RTC_META.has(t.name) ? full(t.name).inputSchema : shape(full(t.name).inputSchema)) : null);
  });
  it('drops field explanations from workflow tools, but not from the meta tools', () => {
    const brand = compact.find(t => t.name === 'workflow_brand_mailbox');
    expect(fieldDescriptions(full('workflow_brand_mailbox').inputSchema)).toBeGreaterThan(5);
    expect(fieldDescriptions(brand.inputSchema)).toBe(0);
    const call = compact.find(t => t.name === 'workspace_call');
    expect(call.inputSchema).toEqual(full('workspace_call').inputSchema);
  });
  it('keeps the tool description itself and leaves the full catalog untouched', () => {
    const brand = compact.find(t => t.name === 'workflow_brand_mailbox');
    expect(brand.description).toBe(full('workflow_brand_mailbox').description);
    const catalog = listedTools(registry.tools, { profile: 'full', listing: 'catalog' });
    expect(catalog.find(t => t.name === 'workflow_brand_mailbox').inputSchema).toEqual(full('workflow_brand_mailbox').inputSchema);
  });
  it('a field literally named "description" is kept', () => {
    const withField = registry.tools.find(t => t.inputSchema?.properties?.description && typeof t.inputSchema.properties.description === 'object');
    if (!withField) return;
    const listed = listedTools([withField], { profile: 'full', listing: 'compact' })[0];
    if (listed) expect(listed.inputSchema.properties.description).toBeDefined();
  });
});
