import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

const h = vi.hoisted(() => ({
  auth: 'ok',
  clients: [],
  deleted: [],
}));

vi.mock('../../src/db.js', () => ({
  initSchema: async () => {},
  listOAuthClients: async () => h.clients,
  deleteOAuthClient: async (clientId) => {
    const before = h.clients.length;
    h.clients = h.clients.filter((row) => row.client_id !== clientId);
    h.deleted.push(clientId);
    return {deleted: h.clients.length < before, codesRemoved: 1, tokensRemoved: 2};
  },
  recordLoginAttempt: async () => 1,
  countRecentFailedLogins: async () => 0,
  markLoginAttemptSucceeded: async () => {},
}));

vi.mock('../../src/oauth/login-guard.js', () => ({
  clientIp: () => 'test-ip',
  LOCKOUT_WINDOW_MINUTES: 15,
  evaluateLogin: async () => ({status: h.auth}),
}));

import handler from '../../api/owner/clients.js';

class ResponseRecorder {
  constructor() { this.headers = {}; this.statusCode = null; this.body = ''; }
  setHeader(name, value) { this.headers[name.toLowerCase()] = value; }
  writeHead(status, headers) { this.statusCode = status; Object.assign(this.headers, headers); }
  status(status) { this.statusCode = status; return this; }
  send(body) { this.body = body; }
  end() {}
}

const originalEnv = {...process.env};
const PASS = 'correct horse battery staple';

function seedClients() {
  h.clients = [
    {client_id: 'probe-1', client_name: 'Vivienne RAR connection probe', redirect_uris: ['https://agent.meta.ai/api/hatch/oauth/callback'], has_secret: false, token_count: 0, created_at: '2026-11-03T00:00:00.000Z'},
    {client_id: 'probe-2', client_name: 'Secret probe <script>', redirect_uris: ['https://example.test/cb'], has_secret: true, token_count: 3, created_at: '2026-11-03T00:00:00.000Z'},
  ];
}

async function post(fields) {
  const response = new ResponseRecorder();
  await handler({
    method: 'POST',
    url: '/api/owner/clients',
    headers: {host: 'example.test', origin: 'https://example.test'},
    body: fields,
  }, response);
  return response;
}

beforeEach(() => {
  process.env.PUBLIC_BASE_URL = 'https://example.test';
  process.env.ADMIN_PASSPHRASE = PASS;
  // Client administration is a security control: it must work while new
  // sign-ins are off. The page never consults the legacy switch; setting it
  // off here proves the list/revoke path is independent of it.
  process.env.LEGACY_OWNER_SIGNIN_ENABLED = 'false';
  h.auth = 'ok';
  h.deleted = [];
  seedClients();
});

afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
  Object.assign(process.env, originalEnv);
});

describe('owner client administration', () => {
  it('GET serves the list and revoke forms', async () => {
    const response = new ResponseRecorder();
    await handler({method: 'GET', url: '/api/owner/clients', headers: {host: 'example.test'}}, response);
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/List registrations/);
    expect(response.body).toMatch(/Revoke one registration/);
  });

  it('wrong passphrase is refused and no state changes', async () => {
    h.auth = 'failed';
    const response = await post({action: 'list', passphrase: 'wrong'});
    expect(response.statusCode).toBe(401);
    expect(h.deleted).toEqual([]);
  });

  it('the shared lockout refuses even the correct passphrase after repeated failures', async () => {
    h.auth = 'locked';
    const response = await post({action: 'list', passphrase: PASS});
    expect(response.statusCode).toBe(429);
    expect(response.headers['retry-after']).toBe('900');
  });

  it('list returns registrations with token counts and escaped names, never a secret value', async () => {
    const response = await post({action: 'list', passphrase: PASS});
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/Vivienne RAR connection probe/);
    expect(response.body).toMatch(/Secret probe &lt;script&gt;/);
    expect(response.body).not.toMatch(/<script>/);
    expect(response.body).toMatch(/stored/);
    expect(response.body).toMatch(/none \(public client\)/);
  });

  it('revoke deletes the registration and reports the cascade', async () => {
    const response = await post({action: 'revoke', client_id: 'probe-1', confirmation: 'REVOKE', passphrase: PASS});
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/Registration revoked/);
    expect(response.body).toMatch(/2 token\(s\) and 1 outstanding code\(s\)/);
    expect(h.deleted).toEqual(['probe-1']);
  });

  it('revoke requires the typed confirmation', async () => {
    const response = await post({action: 'revoke', client_id: 'probe-1', confirmation: 'yes', passphrase: PASS});
    expect(response.statusCode).toBe(400);
    expect(h.deleted).toEqual([]);
  });

  it('the protected stable muse registration cannot be revoked here', async () => {
    const response = await post({action: 'revoke', client_id: 'muse', confirmation: 'REVOKE', passphrase: PASS});
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/Revoke refused/);
    expect(h.deleted).toEqual([]);
  });

  it('revoking an unknown id reports nothing revoked and deletes nothing extra', async () => {
    const response = await post({action: 'revoke', client_id: 'nope', confirmation: 'REVOKE', passphrase: PASS});
    expect(response.statusCode).toBe(200);
    expect(response.body).toMatch(/Nothing revoked/);
  });
});
