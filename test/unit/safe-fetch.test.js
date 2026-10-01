import { describe, it, expect } from 'vitest';
import { Readable } from 'node:stream';
import { fetchLimited, isPrivateAddress, MAX_BYTES } from '../../src/tools/safe-fetch.js';
import { handlers } from '../../src/tools/drive.js';
import { makeFakeClients } from '../helpers/fake-google.js';

const publicDns = async () => [{ address: '93.184.216.34' }];
const reply = (status, { body = '', headers = {} } = {}) => ({
  status, ok: status >= 200 && status < 300, statusText: '',
  headers: { get: (k) => headers[k.toLowerCase()] ?? null },
  body: Readable.from([Buffer.from(body)])
});
const scripted = (steps) => {
  const seen = [];
  const fetchImpl = async (url, opts) => { seen.push({ url, headers: opts.headers }); return steps.shift()(url); };
  return { fetchImpl, seen };
};
const opts = (extra) => ({ resolve: publicDns, env: {}, ...extra });

describe('fetchLimited', () => {
  it('returns the bytes and content type of a normal file', async () => {
    const { fetchImpl } = scripted([() => reply(200, { body: 'hello', headers: { 'content-type': 'text/plain; charset=utf-8' } })]);
    const out = await fetchLimited('https://example.com/a.txt', opts({ fetchImpl }));
    expect(out.bytes.toString()).toBe('hello');
    expect(out.contentType).toMatch(/^text\/plain/);
  });

  it('sends the GitHub token only to raw.githubusercontent.com', async () => {
    const env = { GITHUB_TOKEN: 'fake-token-for-test' };
    const a = scripted([() => reply(200, { body: 'x' })]);
    await fetchLimited('https://raw.githubusercontent.com/o/r/main/f.pdf', opts({ fetchImpl: a.fetchImpl, env }));
    expect(a.seen[0].headers.Authorization).toBe('Bearer fake-token-for-test');

    for (const host of ['https://example.com/f', 'https://github.com/o/r/raw/main/f', 'https://raw.githubusercontent.com.evil.test/f', 'https://evilraw.githubusercontent.com/f']) {
      const b = scripted([() => reply(200, { body: 'x' })]);
      await fetchLimited(host, opts({ fetchImpl: b.fetchImpl, env }));
      expect(b.seen[0].headers.Authorization, host).toBeUndefined();
    }
  });

  it('drops the token when a redirect leaves raw.githubusercontent.com', async () => {
    const env = { GITHUB_TOKEN: 'fake-token-for-test' };
    const s = scripted([
      () => reply(302, { headers: { location: 'https://cdn.example.com/f' } }),
      () => reply(200, { body: 'x' })
    ]);
    await fetchLimited('https://raw.githubusercontent.com/o/r/main/f', opts({ fetchImpl: s.fetchImpl, env }));
    expect(s.seen[0].headers.Authorization).toBeDefined();
    expect(s.seen[1].url).toBe('https://cdn.example.com/f');
    expect(s.seen[1].headers.Authorization).toBeUndefined();
  });

  it('follows 3 redirects but not a 4th', async () => {
    const hop = (n) => () => reply(302, { headers: { location: `/r${n}` } });
    const ok3 = scripted([hop(1), hop(2), hop(3), () => reply(200, { body: 'done' })]);
    expect((await fetchLimited('https://example.com/', opts({ fetchImpl: ok3.fetchImpl }))).bytes.toString()).toBe('done');
    const bad = scripted([hop(1), hop(2), hop(3), hop(4), () => reply(200)]);
    await expect(fetchLimited('https://example.com/', opts({ fetchImpl: bad.fetchImpl }))).rejects.toThrow(/redirect/i);
  });

  it('refuses a redirect that points at an internal address', async () => {
    const s = scripted([() => reply(302, { headers: { location: 'http://169.254.169.254/latest/meta-data' } })]);
    await expect(fetchLimited('https://example.com/', opts({ fetchImpl: s.fetchImpl }))).rejects.toThrow(/internal|private/i);
    expect(s.seen).toHaveLength(1);
  });

  it('refuses non-web schemes, embedded credentials, internal names, and names that resolve to private addresses', async () => {
    const never = async () => { throw new Error('must not fetch'); };
    await expect(fetchLimited('file:///etc/passwd', opts({ fetchImpl: never }))).rejects.toThrow(/http/i);
    await expect(fetchLimited('ftp://example.com/x', opts({ fetchImpl: never }))).rejects.toThrow(/http/i);
    await expect(fetchLimited('https://user:pw@example.com/x', opts({ fetchImpl: never }))).rejects.toThrow(/username|password/i);
    await expect(fetchLimited('http://localhost:3000/', opts({ fetchImpl: never }))).rejects.toThrow(/internal/i);
    await expect(fetchLimited('http://10.0.0.5/', opts({ fetchImpl: never }))).rejects.toThrow(/private/i);
    await expect(fetchLimited('http://[::1]/', opts({ fetchImpl: never }))).rejects.toThrow(/private/i);
    await expect(fetchLimited('http://sneaky.example.com/', opts({ fetchImpl: never, resolve: async () => [{ address: '192.168.1.10' }] }))).rejects.toThrow(/private/i);
    await expect(fetchLimited('not a url', opts({ fetchImpl: never }))).rejects.toThrow(/valid web address/i);
  });

  it('enforces the 10 MB limit both from the header and while streaming', async () => {
    const big = scripted([() => reply(200, { body: 'x', headers: { 'content-length': String(MAX_BYTES + 1) } })]);
    await expect(fetchLimited('https://example.com/', opts({ fetchImpl: big.fetchImpl }))).rejects.toThrow(/limit/i);
    const liar = scripted([() => ({ ...reply(200), body: Readable.from([Buffer.alloc(MAX_BYTES), Buffer.alloc(1)]) })]);
    await expect(fetchLimited('https://example.com/', opts({ fetchImpl: liar.fetchImpl }))).rejects.toThrow(/10 MB/);
  });

  it('reports a non-success answer plainly', async () => {
    const s = scripted([() => reply(404)]);
    await expect(fetchLimited('https://example.com/missing', opts({ fetchImpl: s.fetchImpl }))).rejects.toThrow(/404/);
  });

  it('gives up when the server is too slow', async () => {
    const slow = (_url, { signal }) => new Promise((_, reject) => signal.addEventListener('abort', () => reject(signal.reason)));
    await expect(fetchLimited('https://example.com/', opts({ fetchImpl: slow, timeoutMs: 20 }))).rejects.toThrow();
  });
});

describe('isPrivateAddress', () => {
  it('flags private, loopback, link-local and mapped forms, and passes public ones', () => {
    for (const a of ['127.0.0.1', '10.1.2.3', '172.16.0.1', '172.31.255.255', '192.168.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '::1', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1', '::ffff:7f00:1']) {
      expect(isPrivateAddress(a), a).toBe(true);
    }
    for (const a of ['93.184.216.34', '8.8.8.8', '172.32.0.1', '2606:4700::1111']) expect(isPrivateAddress(a), a).toBe(false);
  });
});

describe('drive_upload_from_url', () => {
  it('uploads the fetched bytes to Drive as a stream with the reported type and parent folder', async () => {
    const { clients, calls, when } = makeFakeClients();
    when('drive.files.create').resolves({ data: { id: 'f9', name: 'Brand.pdf' } });
    const { fetchImpl } = scripted([() => reply(200, { body: 'PDFBYTES', headers: { 'content-type': 'application/pdf' } })]);
    const result = await handlers.drive_upload_from_url(
      { url: 'https://example.com/b.pdf', name: 'Brand.pdf', parentFolderId: 'folderX' }, clients, { fetchOptions: opts({ fetchImpl }) });
    const arg = calls.find((c) => c.path === 'drive.files.create').args[0];
    expect(arg.requestBody).toEqual({ name: 'Brand.pdf', parents: ['folderX'] });
    expect(arg.media.mimeType).toBe('application/pdf');
    const chunks = []; for await (const c of arg.media.body) chunks.push(c);
    expect(Buffer.concat(chunks).toString()).toBe('PDFBYTES');
    expect(JSON.parse(result.content[0].text).id).toBe('f9');
  });

  it('creates nothing in Drive when the download is refused', async () => {
    const { clients, calls } = makeFakeClients();
    await expect(handlers.drive_upload_from_url({ url: 'http://127.0.0.1/x', name: 'x' }, clients, { fetchOptions: opts({ fetchImpl: async () => { throw new Error('no'); } }) })).rejects.toThrow(/private/);
    expect(calls.filter((c) => c.path === 'drive.files.create')).toHaveLength(0);
  });
});
