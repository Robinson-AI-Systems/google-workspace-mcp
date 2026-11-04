import { it, expect, vi, beforeEach } from 'vitest';
const spies = vi.hoisted(() => ({
  init: vi.fn(async () => {}),
  create: vi.fn(async () => {}),
}));
vi.mock('../../src/db.js', () => ({ initSchema: spies.init, createOAuthClient: spies.create }));
import handler from '../../api/oauth/register.js';
const response = () => ({
  code: null, data: null,
  status(n) { this.code = n; return this; },
  json(v) { this.data = v; return this; },
});
const post = (body) => ({ method: 'POST', body });
beforeEach(() => { spies.create.mockClear(); spies.init.mockClear(); });

it('honours a public client: auth method none stores no secret and issues none', async () => {
  const res = response();
  await handler(post({ redirect_uris: ['https://example.com/cb'], client_name: 'Probe', token_endpoint_auth_method: 'none' }), res);
  expect(res.code).toBe(201);
  expect(res.data.token_endpoint_auth_method).toBe('none');
  expect('client_secret' in res.data).toBe(false);
  const stored = spies.create.mock.calls[0][0];
  expect(stored.clientSecret).toBeNull();
  expect(stored.redirectUris).toEqual(['https://example.com/cb']);
});

it('defaults to client_secret_post with an issued secret when no method is declared', async () => {
  const res = response();
  await handler(post({ redirect_uris: ['https://example.com/cb'], client_name: 'Legacy' }), res);
  expect(res.code).toBe(201);
  expect(res.data.token_endpoint_auth_method).toBe('client_secret_post');
  expect(typeof res.data.client_secret).toBe('string');
  expect(res.data.client_secret.length).toBeGreaterThan(10);
  const stored = spies.create.mock.calls[0][0];
  expect(stored.clientSecret).toBe(res.data.client_secret);
});

it('keeps client_secret_post when that method is declared explicitly', async () => {
  const res = response();
  await handler(post({ redirect_uris: ['https://example.com/cb'], token_endpoint_auth_method: 'client_secret_post' }), res);
  expect(res.code).toBe(201);
  expect(res.data.token_endpoint_auth_method).toBe('client_secret_post');
  expect(typeof res.data.client_secret).toBe('string');
});

it('still refuses registration without redirect_uris and non-POST methods', async () => {
  const res1 = response();
  await handler(post({ client_name: 'NoRedirect' }), res1);
  expect(res1.code).toBe(400);
  expect(res1.data.error).toBe('invalid_client_metadata');
  expect(spies.create).not.toHaveBeenCalled();
  const res2 = response();
  await handler({ method: 'GET', body: {} }, res2);
  expect(res2.code).toBe(405);
});
