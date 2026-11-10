// Copied from stripe-mcp src/core/cimd.js (D-006 MC-3 reference implementation)
// for Workspace Unleashed, 2026-11-09. Client ID cards (CIMD): a visiting client may identify itself by a URL
// pointing at its own client metadata document instead of a server-issued
// client ID (fleet contract, RAS MCP Standard D-001, 2026-11-02; reference
// pattern PenPal's resolveCimdClient, live 2026-11-01). This module fetches
// and validates the card and normalizes it into the same client-record
// shape the dynamic-registration store returns. Every failure resolves to
// null: a legible "unknown client" refusal, never a minted identity.
//
// Fetch safety (SSRF discipline): HTTPS only; the card host must resolve
// exclusively to public addresses (DNS answers are classified before the
// fetch, and any private, link-local or reserved answer refuses the card);
// redirects are followed manually, at most CIMD_MAX_REDIRECTS, only to the
// same host, with every hop revalidated; the whole exchange is bounded by
// one timeout and a byte cap. Secret-holding cards are refused: card
// clients are public clients and are never upgraded to confidential ones.
import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
// Same rule as the fleet's shared validRedirectUri: HTTPS, or http on loopback.
export function validRedirectUri(value) {
  try {
    const u = new URL(value);
    return !u.username && !u.password && !u.hash && !!u.hostname &&
      (u.protocol === 'https:' || (u.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)));
  } catch { return false; }
}

export const CIMD_TIMEOUT_MS = 5000;
export const CIMD_MAX_BYTES = 64 * 1024;
export const CIMD_MAX_REDIRECTS = 3;
const CIMD_CACHE_MS = 60 * 60 * 1000;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const blockedV4 = new BlockList();
for (const [net, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24],
  ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4],
  ['240.0.0.0', 4]
]) blockedV4.addSubnet(net, prefix, 'ipv4');

const blockedV6 = new BlockList();
for (const [net, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64],
  ['2001::', 32], ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10],
  ['ff00::', 8]
]) blockedV6.addSubnet(net, prefix, 'ipv6');

// True only for a globally routable address. IPv4-mapped IPv6 addresses
// are judged by their embedded IPv4 address.
export function isPublicAddress(ip) {
  const family = isIP(ip);
  if (family === 4) return !blockedV4.check(ip, 'ipv4');
  if (family === 6) {
    const lower = String(ip).toLowerCase();
    if (lower.startsWith('::ffff:')) {
      const embedded = lower.slice('::ffff:'.length);
      if (isIP(embedded) === 4) return !blockedV4.check(embedded, 'ipv4');
    }
    return !blockedV6.check(ip, 'ipv6');
  }
  return false;
}

async function defaultLookup(hostname) {
  const answers = await dnsLookup(hostname, { all: true, verbatim: true });
  return answers.map((answer) => answer.address);
}

// Every address the host resolves to must be public; one private answer
// refuses the card (mixed answers are how rebinding hides).
async function hostIsPublic(url, lookupImpl) {
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  if (isIP(hostname)) return isPublicAddress(hostname);
  let addresses;
  try { addresses = await lookupImpl(hostname); } catch { return false; }
  if (!Array.isArray(addresses) || addresses.length === 0) return false;
  return addresses.every((address) => isPublicAddress(address));
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Redirect matching for card clients: exact match, with the one
// sanctioned relaxation (MCP client practice, preserved from the fleet
// reference pattern) — for loopback redirect URIs the port is ignored,
// because native clients such as Claude Code bind ephemeral ports.
// Scheme, host and path still match exactly, and non-loopback URIs
// always match byte-for-byte. (This matcher lives here, not in
// src/core/oauth.js: that module is a checksum-pinned shared leaf and
// must stay byte-identical to the private core.)
export function redirectUriMatches(registered, requested) {
  if (registered === requested) return true;
  let a; let b;
  try { a = new URL(registered); b = new URL(requested); } catch { return false; }
  if (!LOOPBACK_HOSTS.has(a.hostname.toLowerCase()) ||
    !LOOPBACK_HOSTS.has(b.hostname.toLowerCase())) return false;
  return a.protocol === b.protocol && a.hostname === b.hostname &&
    a.pathname === b.pathname && a.search === b.search && !a.hash && !b.hash;
}

export function isCimdClientId(clientId) {
  if (typeof clientId !== 'string' || clientId.length === 0 || clientId.length > 2048) return false;
  let url;
  try { url = new URL(clientId); } catch { return false; }
  return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && !url.hash;
}

function validateCard(doc, clientId) {
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return null;
  // The card's own declared address must equal the URL it was fetched from
  // (the presented client_id), and a client name must be present.
  if (doc.client_id !== clientId) return null;
  if (typeof doc.client_name !== 'string' || doc.client_name.length < 1 ||
    doc.client_name.length > 100 || /[\x00-\x1f\x7f]/.test(doc.client_name)) return null;
  // Secret-holding cards are refused outright, whatever else they declare.
  if ('client_secret' in doc || 'client_secret_expires_at' in doc) return null;
  const method = doc.token_endpoint_auth_method === undefined
    ? 'none' : doc.token_endpoint_auth_method;
  if (method !== 'none') return null;
  if (!Array.isArray(doc.redirect_uris) || doc.redirect_uris.length < 1 ||
    doc.redirect_uris.length > 8 ||
    new Set(doc.redirect_uris).size !== doc.redirect_uris.length ||
    !doc.redirect_uris.every((x) => typeof x === 'string' &&
      Buffer.byteLength(x, 'utf8') <= 2048 && validRedirectUri(x))) return null;
  // A card must offer authorization_code. Other grants it lists are ignored,
  // never refused and never granted: Claude's own card (2026-11-09) also lists
  // urn:ietf:params:oauth:grant-type:jwt-bearer, and refusing it locked Claude
  // out ("Unknown client_id"). This server only ever runs code + refresh.
  if (doc.grant_types !== undefined && (!Array.isArray(doc.grant_types) ||
    doc.grant_types.length < 1 || doc.grant_types.length > 10 ||
    !doc.grant_types.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 200) ||
    !doc.grant_types.includes('authorization_code'))) return null;
  if (doc.response_types !== undefined && (!Array.isArray(doc.response_types) ||
    doc.response_types.length !== 1 || doc.response_types[0] !== 'code')) return null;
  return {
    client_id: clientId,
    token_endpoint_auth_method: 'none',
    client_secret_hash: null,
    redirect_uris: [...doc.redirect_uris],
    client_name: doc.client_name,
    cimd: true
  };
}

const cimdCache = new Map(); // client_id URL -> { client, at }

export async function resolveCimdClient(clientId, {
  fetchImpl = fetch, lookupImpl = defaultLookup, now = Date.now
} = {}) {
  if (!isCimdClientId(clientId)) return null;
  const cached = cimdCache.get(clientId);
  if (cached && now() - cached.at < CIMD_CACHE_MS) return cached.client;
  let current;
  try { current = new URL(clientId); } catch { return null; }
  const signal = AbortSignal.timeout(CIMD_TIMEOUT_MS);
  let text;
  for (let hops = 0; ; hops++) {
    if (current.protocol !== 'https:' || !await hostIsPublic(current, lookupImpl)) return null;
    let res;
    try {
      res = await fetchImpl(current.toString(), {
        headers: { accept: 'application/json' }, redirect: 'manual', signal
      });
    } catch { return null; }
    if (REDIRECT_STATUSES.has(res.status)) {
      if (hops >= CIMD_MAX_REDIRECTS) return null;
      const location = res.headers?.get?.('location');
      if (!location) return null;
      let next;
      try { next = new URL(location, current); } catch { return null; }
      // A card may not bounce the fetch to a different authority and then
      // claim the original address as its identity.
      if (next.hostname !== current.hostname) return null;
      current = next;
      continue;
    }
    if (!res.ok) return null;
    const declared = Number(res.headers?.get?.('content-length'));
    if (Number.isFinite(declared) && declared > CIMD_MAX_BYTES) return null;
    try { text = await res.text(); } catch { return null; }
    if (typeof text !== 'string' || Buffer.byteLength(text, 'utf8') > CIMD_MAX_BYTES) return null;
    break;
  }
  let doc;
  try { doc = JSON.parse(text); } catch { return null; }
  const client = validateCard(doc, clientId);
  if (!client) return null;
  cimdCache.set(clientId, { client, at: now() });
  return client;
}

export function clearCimdCache() { cimdCache.clear(); }
