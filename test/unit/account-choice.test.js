// One connection, several Google accounts: any tool call may name `account`
// (email or label). Owner connections switch among the owner's linked
// accounts; public connections stay on their one account.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { takeAccount, matchLinkedAccount, onlyThisAccount } from '../../src/tools/account-choice.js';

const linked = [
  { email: 'dev@business-one.example', label: 'Business One' },
  { email: 'office@business-two.example', label: 'Business Two' },
  { email: 'me@personal.example', label: null }
];
const built = [];
vi.mock('../../src/db.js', async (importActual) => ({
  ...(await importActual()),
  listGoogleAccounts: async () => linked,
  getAllowedDomains: async () => []
}));
vi.mock('../../src/auth/google-auth-hosted.js', async (importActual) => ({
  ...(await importActual()),
  buildHostedApiClients: async (email) => { built.push(email ?? null); return { actingAs: email ?? 'dev@business-one.example' }; }
}));
vi.mock('../../src/tools/index.js', async () => {
  const meta = await import('../../src/tools/rtc-meta.js');
  const echo = (args, clients) => ({ content: [{ type: 'text', text: JSON.stringify({ as: clients.actingAs, args }) }] });
  return { registry: {
    tools: [{ name: 'echo_tool', description: 'echo', inputSchema: { type: 'object', properties: { q: { type: 'string' } } } }, ...meta.tools],
    handlers: { echo_tool: echo, ...meta.handlers }
  } };
});
vi.mock('../../src/rtc/catalog.js', async (importActual) => ({
  ...(await importActual()),
  allowedTool: () => true,
  isWrite: () => false,
  listedTools: (tools) => tools,
  toolMetadata: (t) => t
}));
const { _buildServerForTest } = await import('../../api/mcp.js');
// Resolve the mocked tool list once up front, so concurrent lookups inside
// workspace_batch all see the same test registry.
await (await import('../../src/tools/index.js')).registry;
await (await import('../../src/tools/rtc-meta.js')).handlers.workspace_call({ name: 'echo_tool' }, { actingAs: 'warm' });

async function connect(server) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 't', version: '1' });
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}
const result = r => { if (r.isError) return { error: r.content[0].text }; return JSON.parse(r.content[0].text); };

beforeEach(() => { built.length = 0; });

describe('picking an account', () => {
  it('takes account off the arguments, leaving the rest untouched', () => {
    expect(takeAccount({ q: 1, account: ' a@b.com ' })).toEqual({ account: 'a@b.com', rest: { q: 1 } });
    expect(takeAccount({ q: 1 })).toEqual({ account: undefined, rest: { q: 1 } });
    expect(takeAccount({ q: 1, account: '' })).toEqual({ account: undefined, rest: { q: 1 } });
    expect(() => takeAccount({ account: 5 })).toThrow(/invalid_args/);
  });
  it('matches email first, then a unique label, case-insensitively', () => {
    expect(matchLinkedAccount('ME@personal.example', linked)).toBe('me@personal.example');
    expect(matchLinkedAccount('business two', linked)).toBe('office@business-two.example');
    expect(() => matchLinkedAccount('someone@else.com', linked)).toThrow(/Linked accounts: dev@business-one.example/);
    expect(() => matchLinkedAccount('Work', [{ email: 'a@x.com', label: 'Work' }, { email: 'b@x.com', label: 'work' }])).toThrow(/More than one/);
    expect(() => matchLinkedAccount('x', [])).toThrow(/No Google accounts/);
  });
  it('a one-account connection accepts only its own account', () => {
    expect(() => onlyThisAccount('Me@x.com', 'me@x.com')).not.toThrow();
    expect(() => onlyThisAccount('other@x.com', 'me@x.com')).toThrow(/works with me@x.com only/);
  });
});

describe('owner connection: one connection, every linked account', () => {
  const owner = () => connect(_buildServerForTest('dev@business-one.example', 'conn-1', {}, null, { multiAccount: true }));

  it('lists the account choice on tools', async () => {
    const { tools } = await (await owner()).listTools();
    expect(tools.find(t => t.name === 'echo_tool').inputSchema.properties.account.type).toBe('string');
  });
  it('without account, uses the connection account exactly as before', async () => {
    const r = result(await (await owner()).callTool({ name: 'echo_tool', arguments: { q: 'x' } }));
    expect(r).toEqual({ as: 'dev@business-one.example', args: { q: 'x' } });
  });
  it('with account (email or label), uses that account and hides the choice from the tool', async () => {
    const c = await owner();
    expect(result(await c.callTool({ name: 'echo_tool', arguments: { q: 'x', account: 'me@personal.example' } }))).toEqual({ as: 'me@personal.example', args: { q: 'x' } });
    expect(result(await c.callTool({ name: 'echo_tool', arguments: { account: 'Business Two' } })).as).toBe('office@business-two.example');
  });
  it('refuses an account that is not linked, listing the ones that are', async () => {
    const r = result(await (await owner()).callTool({ name: 'echo_tool', arguments: { account: 'stranger@evil.com' } }));
    expect(r.error).toMatch(/not one of the Google accounts linked here/);
    expect(built).not.toContain('stranger@evil.com');
  });
  it('workspace_call passes the account through, beside or inside args', async () => {
    const c = await owner();
    const beside = result(await c.callTool({ name: 'workspace_call', arguments: { name: 'echo_tool', account: 'me@personal.example', args: { q: 1 } } }));
    expect(beside).toEqual({ as: 'me@personal.example', args: { q: 1 } });
    const inside = result(await c.callTool({ name: 'workspace_call', arguments: { name: 'echo_tool', args: { q: 2, account: 'Business One' } } }));
    expect(inside).toEqual({ as: 'dev@business-one.example', args: { q: 2 } });
  });
  it('workspace_batch can read three accounts in one request', async () => {
    const r = result(await (await owner()).callTool({ name: 'workspace_batch', arguments: { calls: [
      { name: 'echo_tool', args: { q: 'a' } },
      { name: 'echo_tool', account: 'Business Two', args: { q: 'b' } },
      { name: 'echo_tool', args: { q: 'c', account: 'me@personal.example' } }
    ] } }));
    expect(r.results.map(x => JSON.parse(x.response.content[0].text).as)).toEqual(['dev@business-one.example', 'office@business-two.example', 'me@personal.example']);
    expect(r.results[1].account).toBe('office@business-two.example');
  });
});

describe('public connection: stays on its one account', () => {
  const pub = () => connect(_buildServerForTest(null, 'conn-p', { listing: 'catalog' }, async () => ({ actingAs: 'user@example.com' }), { actingAs: 'user@example.com' }));

  it('does not advertise the account choice per tool', async () => {
    const { tools } = await (await pub()).listTools();
    expect(tools.find(t => t.name === 'echo_tool').inputSchema.properties.account).toBeUndefined();
  });
  it('naming its own account works; naming another is refused without touching owner accounts', async () => {
    const c = await pub();
    expect(result(await c.callTool({ name: 'echo_tool', arguments: { account: 'USER@example.com', q: 1 } }))).toEqual({ as: 'user@example.com', args: { q: 1 } });
    const r = result(await c.callTool({ name: 'echo_tool', arguments: { account: 'dev@business-one.example' } }));
    expect(r.error).toMatch(/works with user@example.com only/);
    const viaCall = result(await c.callTool({ name: 'workspace_call', arguments: { name: 'echo_tool', account: 'me@personal.example' } }));
    expect(viaCall.error).toMatch(/works with user@example.com only/);
    expect(built).toEqual([]);
  });
});
