// The canonical-host decision behind every browser door's alias
// redirect. Two serving shapes must both work: the platform shape
// (the edge presents the addressed public host as Host) and the rack
// shape (the gateway proxies to the instance's internal endpoint, so
// Host is a private endpoint address and the addressed public host is
// the one the gateway preserved in x-forwarded-host). The rack shape
// is the 2026-11-08 ERR_TOO_MANY_REDIRECTS regression: every
// canonical-checking door redirected the canonical name to itself.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { requestHostIsCanonical, redirectCanonicalGet } from '../../src/principals/canonical-entry.js';

const ORIGIN = 'https://workspace.example.test';
let saved;
beforeEach(() => { saved = process.env.PUBLIC_BASE_URL; process.env.PUBLIC_BASE_URL = ORIGIN; });
afterEach(() => { if (saved === undefined) delete process.env.PUBLIC_BASE_URL; else process.env.PUBLIC_BASE_URL = saved; });

const req = (headers) => ({ method: 'GET', headers, query: {} });
function res() {
  const r = { headers: {}, statusCode: 200 };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.writeHead = (c, h = {}) => { r.statusCode = c; Object.assign(r.headers, h); };
  r.end = () => r;
  return r;
}

describe('requestHostIsCanonical', () => {
  it('accepts the platform-presented canonical Host', () => {
    expect(requestHostIsCanonical(req({ host: 'workspace.example.test' }), ORIGIN)).toBe(true);
    expect(requestHostIsCanonical(req({ host: 'Workspace.Example.Test' }), ORIGIN)).toBe(true);
  });

  it('rejects public alias hosts, even with a canonical-looking forwarded header', () => {
    expect(requestHostIsCanonical(req({ host: 'alias.example.test' }), ORIGIN)).toBe(false);
    expect(requestHostIsCanonical(req({ host: 'alias.example.test', 'x-forwarded-host': 'workspace.example.test' }), ORIGIN)).toBe(false);
    expect(requestHostIsCanonical(req({ host: 'attacker.example.test', 'x-forwarded-host': 'workspace.example.test' }), ORIGIN)).toBe(false);
  });

  it('accepts the rack shape: internal endpoint Host plus the gateway-preserved canonical forwarded host', () => {
    expect(requestHostIsCanonical(req({ host: '172.29.0.3:8787', 'x-forwarded-host': 'workspace.example.test' }), ORIGIN)).toBe(true);
    expect(requestHostIsCanonical(req({ host: 'rack-inst-b9402ef1b8c4:8787', 'x-forwarded-host': 'workspace.example.test' }), ORIGIN)).toBe(true);
    expect(requestHostIsCanonical(req({ host: '127.0.0.1:8787', 'x-forwarded-host': 'workspace.example.test' }), ORIGIN)).toBe(true);
    expect(requestHostIsCanonical(req({ host: 'localhost:8787', 'x-forwarded-host': 'workspace.example.test' }), ORIGIN)).toBe(true);
  });

  it('still declines the rack shape when the addressed public host was an alias or is unknown', () => {
    expect(requestHostIsCanonical(req({ host: '172.29.0.3:8787', 'x-forwarded-host': 'preview.example.test' }), ORIGIN)).toBe(false);
    expect(requestHostIsCanonical(req({ host: '172.29.0.3:8787' }), ORIGIN)).toBe(false);
  });

  it('fails closed on a missing host or an unparsable canonical origin', () => {
    expect(requestHostIsCanonical(req({}), ORIGIN)).toBe(false);
    expect(requestHostIsCanonical(req({ host: 'workspace.example.test' }), 'not a url')).toBe(false);
  });
});

describe('redirectCanonicalGet', () => {
  it('does not redirect the rack-shaped canonical request', () => {
    const r = res();
    const out = redirectCanonicalGet(
      { method: 'GET', headers: { host: '172.29.0.3:8787', 'x-forwarded-host': 'workspace.example.test' }, query: { purpose: 'owner_login' } },
      r, '/api/auth/google/start', true);
    expect(out).toBe(false);
    expect(r.headers.Location).toBeUndefined();
  });

  it('redirects a public alias to the canonical target with OAuth params carried', () => {
    const r = res();
    const out = redirectCanonicalGet(
      { method: 'GET', headers: { host: 'alias.example.test' }, query: { purpose: 'owner_login' } },
      r, '/api/auth/google/start', true);
    expect(out).toBe(true);
    expect(r.statusCode).toBe(303);
    expect(r.headers.Location).toBe('https://workspace.example.test/api/auth/google/start?purpose=owner_login');
  });

  it('leaves headerless internal adapters alone', () => {
    const r = res();
    expect(redirectCanonicalGet({ method: 'GET', headers: {}, query: {} }, r, '/api/account')).toBe(false);
    expect(r.headers.Location).toBeUndefined();
  });
});
