import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { registry } from '../../src/tools/index.js';
import { renderToolCatalog, regenerateReadme, CATALOG_START, CATALOG_END } from '../../src/catalog-document.js';

describe('P5-4 assembled registry catalog', () => {
  it('documents exactly the effective protected runtime registration, without drift', () => {
    const readme = readFileSync(new URL('../../README.md', import.meta.url), 'utf8');
    expect(regenerateReadme(readme, registry.tools)).toBe(readme);
    const content = readme.split(CATALOG_START)[1].split(CATALOG_END)[0].trim();
    expect(content).toBe(renderToolCatalog(registry.tools));
    const names = [...content.matchAll(/^- `([a-z][a-z0-9_]*)`$/gm)].map(m => m[1]);
    expect(names.length).toBe(registry.tools.length);
    expect(new Set(names).size).toBe(names.length);
    expect(names).toContain('gmail_untrash_message');
    expect(names).toContain('workspace_batch');
    expect(names).toContain('workspace_dev_cleanup');
  });
  it('does not depend on input registry order', () => {
    const forward = [{ name: 'workspace_whoami' }, { name: 'gmail_list_messages' }];
    expect(renderToolCatalog(forward)).toBe(renderToolCatalog([...forward].reverse()));
  });
  it('refuses duplicate, malformed, missing or ambiguous content', () => {
    expect(() => renderToolCatalog([])).toThrow('empty');
    expect(() => renderToolCatalog([{ name: 'gmail_list_messages' }, { name: 'gmail_list_messages' }])).toThrow('Duplicate');
    expect(() => renderToolCatalog([{ name: 'javascript:evil' }])).toThrow('Invalid');
    expect(() => regenerateReadme('no catalog', registry.tools)).toThrow('markers');
    expect(() => regenerateReadme(CATALOG_START + '\n' + CATALOG_END + CATALOG_END, registry.tools)).toThrow('repeated');
  });
});
