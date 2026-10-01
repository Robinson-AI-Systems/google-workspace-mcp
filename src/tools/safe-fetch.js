// Fetches a file from a web address for tools like drive_upload_from_url.
//
// Rules, in plain terms:
//  - only http(s) addresses; at most 10 MB; gives up after 20 seconds;
//  - follows at most 3 redirects, and re-checks every hop against these rules;
//  - refuses addresses that point back inside our own network (localhost,
//    private ranges, cloud metadata), so a tool call cannot be used to poke at
//    internal services;
//  - a GitHub token (GITHUB_TOKEN) is attached ONLY when the host is exactly
//    raw.githubusercontent.com, on every hop, and never anywhere else.
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const MAX_BYTES = 10 * 1024 * 1024;
export const TIMEOUT_MS = 20000;
export const MAX_REDIRECTS = 3;
export const TOKEN_HOST = 'raw.githubusercontent.com';

/** True for loopback, private, link-local, unspecified and metadata addresses (IPv4 or IPv6). */
export function isPrivateAddress(addr) {
  const a = String(addr).toLowerCase();
  if (isIP(a) === 4) {
    const [p, q] = a.split('.').map(Number);
    return p === 0 || p === 10 || p === 127 || (p === 169 && q === 254) || (p === 172 && q >= 16 && q <= 31) ||
      (p === 192 && q === 168) || (p === 100 && q >= 64 && q <= 127) || p >= 224;
  }
  if (isIP(a) === 6) {
    const mapped = a.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hexMapped = a.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hexMapped) {
      const hi = parseInt(hexMapped[1], 16), lo = parseInt(hexMapped[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    return a === '::' || a === '::1' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a);
  }
  return false;
}

async function assertPublicHost(hostname, resolve) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error(`Refusing to fetch ${host}: it is an internal address.`);
  }
  const addrs = isIP(host) ? [host] : (await resolve(host)).map((r) => r.address);
  if (!addrs.length || addrs.some(isPrivateAddress)) {
    throw new Error(`Refusing to fetch ${host}: it points at an internal or private network address.`);
  }
}

/**
 * Download `url` and return { bytes: Buffer, contentType, finalUrl }.
 * `fetchImpl`, `resolve` and `env` can be replaced in tests.
 */
export async function fetchLimited(url, { fetchImpl = fetch, resolve = (h) => dnsLookup(h, { all: true }), env = process.env, timeoutMs = TIMEOUT_MS } = {}) {
  let current;
  try { current = new URL(url); } catch { throw new Error('That is not a valid web address.'); }
  const signal = AbortSignal.timeout(timeoutMs);

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (current.protocol !== 'https:' && current.protocol !== 'http:') throw new Error('Only http and https addresses are allowed.');
    if (current.username || current.password) throw new Error('Addresses with a built-in username or password are not allowed.');
    await assertPublicHost(current.hostname, resolve);

    const headers = {};
    if (current.hostname.toLowerCase() === TOKEN_HOST && env.GITHUB_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_TOKEN}`;
    const res = await fetchImpl(current.toString(), { headers, redirect: 'manual', signal });

    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      if (hop === MAX_REDIRECTS) throw new Error(`Too many redirects (more than ${MAX_REDIRECTS}).`);
      current = new URL(res.headers.get('location'), current);
      continue;
    }
    if (!res.ok) throw new Error(`The address answered ${res.status}${res.statusText ? ' ' + res.statusText : ''}.`);

    const declared = Number(res.headers.get('content-length'));
    if (declared > MAX_BYTES) throw new Error(`The file is ${declared} bytes; the limit is ${MAX_BYTES} (10 MB).`);
    const chunks = [];
    let total = 0;
    for await (const chunk of res.body) {
      total += chunk.length;
      if (total > MAX_BYTES) throw new Error('The file is larger than the 10 MB limit.');
      chunks.push(Buffer.from(chunk));
    }
    return { bytes: Buffer.concat(chunks), contentType: res.headers.get('content-type') || null, finalUrl: current.toString() };
  }
  throw new Error('Too many redirects.');
}
