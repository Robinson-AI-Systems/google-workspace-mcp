import { describe, it, expect } from 'vitest';
import { ok, compact, MAX_ITEMS, MAX_BASE64_CHARS } from '../../src/tools/util.js';

const parsed = (v) => JSON.parse(ok(v).content[0].text);

describe('ok() result shaping', () => {
  it('leaves normal results and plain strings alone', () => {
    expect(parsed({ id: 'a', items: [1, 2, 3] })).toEqual({ id: 'a', items: [1, 2, 3] });
    expect(ok('hello').content[0].text).toBe('hello');
  });
  it('removes Google "service#thing" kind labels everywhere, but not other fields called kind', () => {
    expect(parsed({ kind: 'drive#file', name: 'n', nested: [{ kind: 'calendar#event', id: 1 }], meta: { kind: 'photo' }, lang: { kind: 'C#' } }))
      .toEqual({ name: 'n', nested: [{ id: 1 }], meta: { kind: 'photo' }, lang: { kind: 'C#' } });
  });
  it('keeps etag, because contacts_update needs the one contacts_get returns', () => {
    expect(parsed({ resourceName: 'people/c1', etag: '%EgUBAj4=', metadata: { sources: [{ etag: 'inner' }] } }))
      .toEqual({ resourceName: 'people/c1', etag: '%EgUBAj4=', metadata: { sources: [{ etag: 'inner' }] } });
  });
  it('passes dates, buffers and typed arrays through exactly as JSON.stringify would, and never throws', () => {
    const value = { d: new Date(0), b: Buffer.from('hi'), u: new Uint8Array(2) };
    expect(ok(value).content[0].text).toBe(JSON.stringify(value, null, 2));
    const circular = {}; circular.self = circular;
    expect(() => ok(circular)).not.toThrow();
    expect(() => ok({ n: 10n })).not.toThrow();
  });
  it('never mistakes ordinary long text for file data', () => {
    const letters = 'Hello'.repeat(30000);
    expect(parsed({ body: letters }).body).toBe(letters);       // not a data-like field name
    expect(parsed({ content: letters }).content).toMatchObject({ omitted: 'data' }); // data-like name and base64-shaped: size only
    expect(ok(letters).content[0].text).toBe(letters);          // a bare string is never touched
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
