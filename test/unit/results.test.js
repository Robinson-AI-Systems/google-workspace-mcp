import { describe, it, expect } from 'vitest';
import { ok, compact, MAX_ITEMS, MAX_BASE64_CHARS } from '../../src/tools/util.js';

const parsed = (v) => JSON.parse(ok(v).content[0].text);

describe('ok() result shaping', () => {
  it('leaves normal results and plain strings alone', () => {
    expect(parsed({ id: 'a', items: [1, 2, 3] })).toEqual({ id: 'a', items: [1, 2, 3] });
    expect(ok('hello').content[0].text).toBe('hello');
  });
  it('removes etag and Google "service#thing" kind markers everywhere, but not other fields called kind', () => {
    expect(parsed({ kind: 'drive#file', etag: '"x"', name: 'n', nested: [{ kind: 'calendar#event', etag: 'e', id: 1 }], meta: { kind: 'photo' } }))
      .toEqual({ name: 'n', nested: [{ id: 1 }], meta: { kind: 'photo' } });
  });
  it('cuts a long list inside a result to 200 and says how many there were, keeping nextPageToken', () => {
    const files = Array.from({ length: 450 }, (_, i) => ({ id: i }));
    const out = parsed({ files, nextPageToken: 'tok' });
    expect(out.files).toHaveLength(MAX_ITEMS);
    expect(out.files[199]).toEqual({ id: 199 });
    expect(out.files_truncated).toMatch(/first 200 of 450/);
    expect(out.nextPageToken).toBe('tok');
  });
  it('wraps a long top-level list so the note is not lost; a list of exactly 200 is untouched', () => {
    const out = parsed(Array.from({ length: 201 }, (_, i) => i));
    expect(out.items).toHaveLength(MAX_ITEMS);
    expect(out.truncated).toMatch(/first 200 of 201/);
    expect(parsed(Array.from({ length: 200 }, (_, i) => i))).toHaveLength(200);
  });
  it('replaces base64 data over 64 KB with its size, and keeps small data and long non-base64 text', () => {
    const big = Buffer.alloc(100 * 1024, 7).toString('base64');
    const out = parsed({ base64Data: big, name: 'f.bin' });
    expect(out.base64Data).toMatchObject({ omitted: 'data', bytes: 100 * 1024 });
    expect(JSON.stringify(out)).not.toContain(big.slice(0, 50));
    expect(parsed({ base64Data: Buffer.alloc(1000, 7).toString('base64') }).base64Data).toHaveLength(1336);
    const longText = 'Hello, world. '.repeat(10000);
    expect(longText.length).toBeGreaterThan(MAX_BASE64_CHARS);
    expect(parsed({ body: longText }).body).toBe(longText);
  });
  it('does not change the original object', () => {
    const original = { etag: 'e', files: Array.from({ length: 300 }, (_, i) => i) };
    compact(original);
    expect(original.etag).toBe('e');
    expect(original.files).toHaveLength(300);
  });
});
