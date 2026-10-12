// Deterministic, registry-owned documentation. Never scrape names or classifications from README.
import { rtcArea } from './rtc/catalog.js';

export const CATALOG_START = '<!-- BEGIN GENERATED TOOL CATALOG -->';
export const CATALOG_END = '<!-- END GENERATED TOOL CATALOG -->';

export function renderToolCatalog(tools) {
  if (!Array.isArray(tools) || tools.length === 0) throw new Error('Cannot generate an empty tool catalog.');
  const groups = new Map();
  const seen = new Set();
  for (const tool of tools) {
    if (!tool || typeof tool.name !== 'string' || !/^[a-z][a-z0-9_]*$/.test(tool.name))
      throw new Error('Invalid registry tool name.');
    if (seen.has(tool.name)) throw new Error('Duplicate registered tool: ' + tool.name);
    seen.add(tool.name);
    const area = rtcArea(tool.name);
    if (!groups.has(area)) groups.set(area, []);
    groups.get(area).push(tool.name);
  }
  const sorted = [...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
  const lines = [
    '<!-- Registry-derived; regenerate with `npm run gen:catalog`. Do not edit this section by hand. -->',
    '',
    '**' + tools.length + ' registered tools** from the assembled server registry. The names below include read-only operations, guarded writes and five protected meta-tools; listing a tool does not grant permission to call it. For current descriptions, required inputs and account restrictions, use `workspace_describe_tool`.',
    '',
    '| Area | Registered tools |',
    '| --- | ---: |',
    ...sorted.map(([area, names]) => '| ' + area + ' | ' + names.length + ' |'),
    ''
  ];
  for (const [area, names] of sorted) {
    names.sort();
    lines.push('### ' + area + ' (' + names.length + ')', '', ...names.map(name => '- `' + name + '`'), '');
  }
  return lines.join('\n').trimEnd();
}

export function regenerateReadme(readme, tools) {
  const start = readme.indexOf(CATALOG_START);
  const end = readme.indexOf(CATALOG_END);
  if (start === -1 || end === -1 || end < start || readme.indexOf(CATALOG_START, start + 1) !== -1 || readme.indexOf(CATALOG_END, end + 1) !== -1)
    throw new Error('README tool-catalog markers missing, reordered or repeated.');
  return readme.slice(0, start + CATALOG_START.length)
    + '\n' + renderToolCatalog(tools) + '\n'
    + readme.slice(end);
}
