import { describe, it, expect } from 'vitest';
import { mergeNamespaces, ok, errorResult } from '../../src/tools/util.js';
import { registry } from '../../src/tools/index.js';

describe('mergeNamespaces', () => {
  const tool = (name) => ({ name, description: 'd', inputSchema: { type: 'object', properties: {} } });

  it('merges tools and handlers from every module', () => {
    const merged = mergeNamespaces([
      { tools: [tool('a_one')], handlers: { a_one: async () => 1 } },
      { tools: [tool('b_one'), tool('b_two')], handlers: { b_one: async () => 2, b_two: async () => 3 } }
    ]);
    expect(merged.tools.map((t) => t.name)).toEqual(['a_one', 'b_one', 'b_two']);
    expect(Object.keys(merged.handlers)).toEqual(['a_one', 'b_one', 'b_two']);
  });

  it('rejects a duplicate tool name instead of letting one silently replace the other', () => {
    expect(() => mergeNamespaces([
      { tools: [tool('same_name')], handlers: {} },
      { tools: [tool('same_name')], handlers: {} }
    ])).toThrow('Duplicate tool name registered: same_name');
  });
});

describe('the real tool registry', () => {
  it('loads with no duplicate names and a meaningful number of tools', () => {
    const names = registry.tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.length).toBeGreaterThan(300);
  });

  it('gives every tool a handler, and every handler a tool, so nothing is advertised that cannot run or runnable that is hidden', () => {
    const toolNames = new Set(registry.tools.map((t) => t.name));
    const handlerNames = new Set(Object.keys(registry.handlers));
    expect([...toolNames].filter((n) => !handlerNames.has(n))).toEqual([]);
    expect([...handlerNames].filter((n) => !toolNames.has(n))).toEqual([]);
  });

  it('describes every tool and takes an object of arguments', () => {
    for (const t of registry.tools) {
      expect(typeof t.description, t.name).toBe('string');
      expect(t.description.length, t.name).toBeGreaterThan(10);
      expect(t.inputSchema?.type, t.name).toBe('object');
    }
  });

  it('names tools in lowercase snake_case', () => {
    for (const t of registry.tools) expect(t.name).toMatch(/^[a-z][a-z0-9]*(_[a-z0-9]+)+$/);
  });
});

describe('result helpers', () => {
  it('ok() wraps strings as-is and everything else as formatted JSON', () => {
    expect(ok('hello')).toEqual({ content: [{ type: 'text', text: 'hello' }] });
    expect(ok({ a: 1 }).content[0].text).toBe('{\n  "a": 1\n}');
  });

  it('errorResult() shows Google\'s own message and details, and flags the result as an error', () => {
    const err = Object.assign(new Error('generic'), { response: { data: { error: { message: 'Not Authorized to access this resource/api', errors: [{ reason: 'forbidden' }] } } } });
    const result = errorResult(err);
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Not Authorized to access this resource/api');
    expect(result.content[0].text).toContain('forbidden');
    expect(errorResult(new Error('plain failure')).content[0].text).toBe('Error: plain failure');
  });
});
