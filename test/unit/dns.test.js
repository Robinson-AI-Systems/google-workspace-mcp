import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { relativeName } = await import('../../src/tools/dns.js');
const body = (r) => JSON.parse(r.content[0].text);
beforeEach(() => { holder.db = createFakeDb(); });

const D = 'example-rentals.test';
// A stand-in for Vercel's DNS API that remembers records and records every request.
function setup({ ns = ['ns1.vercel-dns.com', 'ns2.vercel-dns.com'], token = 'tok', records = [], failStatus } = {}) {
  const f = makeFakeClients({ actingAs: 'ops@example-rentals.test' });
  const state = { records: [...records], requests: [] };
  f.clients.dnsResolver = { resolveNs: async () => { if (!ns) throw new Error('ENODATA'); return ns; } };
  f.clients.vercel = {
    token, teamId: 'team_x',
    fetch: async (url, init) => {
      const u = new URL(url); const method = init.method;
      state.requests.push({ method, path: u.pathname, search: u.search, body: init.body ? JSON.parse(init.body) : undefined, auth: init.headers.Authorization });
      if (failStatus) return { ok: false, status: failStatus, text: async () => JSON.stringify({ error: { message: 'bad token' } }) };
      if (method === 'GET') return { ok: true, status: 200, text: async () => JSON.stringify({ records: state.records.map((r) => ({ ...r })) }) };
      if (method === 'POST') { const r = { id: `rec_${state.records.length + 1}`, ...JSON.parse(init.body) }; state.records.push(r); return { ok: true, status: 200, text: async () => JSON.stringify({ uid: r.id }) }; }
      if (method === 'DELETE') { const id = decodeURIComponent(u.pathname.split('/').pop()); state.records = state.records.filter((r) => r.id !== id); return { ok: true, status: 200, text: async () => '{}' }; }
    }
  };
  return { ...f, state };
}
const add = (args, f) => registry.handlers.dns_add_record({ domain: D, type: 'TXT', name: '_dmarc', value: 'v=DMARC1; p=none', ...args }, f.clients);
const changing = (state) => state.requests.filter((r) => r.method !== 'GET');

describe('relativeName', () => {
  it('turns every way of writing a name into what Vercel expects', () => {
    expect(['@', '', D, `${D}.`, `_dmarc.${D}`, '_dmarc', 'MAIL']).toEqual(['@', '', D, `${D}.`, `_dmarc.${D}`, '_dmarc', 'MAIL']);
    expect(relativeName('@', D)).toBe('');
    expect(relativeName(D, D)).toBe('');
    expect(relativeName(`_dmarc.${D}.`, D)).toBe('_dmarc');
    expect(relativeName('MAIL', D)).toBe('mail');
  });
});

describe('dns_list_records', () => {
  it('lists records for a Vercel-hosted domain, sending the team and token', async () => {
    const f = setup({ records: [{ id: 'r1', name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none', ttl: 60 }] });
    const out = body(await registry.handlers.dns_list_records({ domain: D }, f.clients));
    expect(out).toMatchObject({ hostedAtVercel: true, count: 1, records: [{ id: 'r1', name: '_dmarc', type: 'TXT' }] });
    expect(f.state.requests[0]).toMatchObject({ method: 'GET', auth: 'Bearer tok' });
    expect(f.state.requests[0].search).toContain('teamId=team_x');
  });
  it('says where DNS actually lives for a domain hosted elsewhere, and calls nothing', async () => {
    const f = setup({ ns: ['dns1.registrar-servers.com'] });
    const out = body(await registry.handlers.dns_list_records({ domain: D }, f.clients));
    expect(out.hostedAtVercel).toBe(false);
    expect(out.explanation).toMatch(/registrar-servers\.com/);
    expect(f.state.requests).toEqual([]);
  });
  it('a domain with no nameservers is not guessed at', async () => {
    const f = setup({ ns: null });
    expect(body(await registry.handlers.dns_list_records({ domain: D }, f.clients)).explanation).toMatch(/cannot tell where its DNS lives/);
  });
  it('is refused for a connection limited to other domains', async () => {
    const f = setup();
    f.clients.allowedDomains = ['robinsonaisystems.com'];
    expect((await registry.handlers.dns_list_records({ domain: D }, f.clients)).content[0].text).toMatch(/Refused/);
    expect(f.state.requests).toEqual([]);
  });
});

describe('dns_add_record', () => {
  it('always asks first, and a preview changes nothing', async () => {
    const f = setup();
    expect(body(await add({}, f)).needsConfirmation).toBe(true);
    const prev = body(await add({ dryRun: true }, f));
    expect(prev).toMatchObject({ done: false, dryRun: true });
    expect(prev.summary).toMatch(/Add TXT record _dmarc\.example-rentals\.test -> v=DMARC1/);
    expect(changing(f.state)).toEqual([]);
  });
  it('adds the record, reads it back and says confirmed', async () => {
    const f = setup();
    const out = body(await add({ confirm: true, name: `_dmarc.${D}` }, f));
    expect(out).toMatchObject({ done: true, confirmed: true });
    expect(changing(f.state)).toEqual([expect.objectContaining({ method: 'POST', path: `/v2/domains/${D}/records`, body: { name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none', ttl: 60 } })]);
    expect((await holder.db.listRecentChanges())[0]).toMatchObject({ tool: 'dns_add_record', target: D });
  });
  it('adding the same record twice does nothing the second time', async () => {
    const f = setup();
    await add({ confirm: true }, f);
    const again = body(await add({ confirm: true }, f));
    expect(again.details).toMatchObject({ changed: false });
    expect(changing(f.state)).toHaveLength(1);
  });
  it('refuses a CNAME where records exist, and a record where a CNAME exists', async () => {
    const f = setup({ records: [{ id: 'r1', name: 'www', type: 'TXT', value: 'x', ttl: 60 }, { id: 'r2', name: 'app', type: 'CNAME', value: 'cname.vercel-dns.com', ttl: 60 }] });
    await expect(add({ confirm: true, type: 'CNAME', name: 'www', value: 'cname.vercel-dns.com' }, f)).rejects.toThrow(/cannot share a name/);
    await expect(add({ confirm: true, type: 'A', name: 'app', value: '1.2.3.4' }, f)).rejects.toThrow(/is a CNAME/);
    expect(changing(f.state)).toEqual([]);
  });
  it('an MX record needs a priority, and bad names, types and ttl are refused before any call', async () => {
    const f = setup();
    await expect(add({ confirm: true, type: 'MX', name: '@', value: 'mx.example.test' }, f)).rejects.toThrow(/mxPriority/);
    await expect(add({ confirm: true, type: 'SOA' }, f)).rejects.toThrow(/must be one of/);
    await expect(add({ confirm: true, name: 'bad name!' }, f)).rejects.toThrow(/not a valid record name/);
    await expect(add({ confirm: true, ttl: 5 }, f)).rejects.toThrow(/ttl/);
    await expect(add({ confirm: true, value: 'a\nb' }, f)).rejects.toThrow(/line breaks/);
    expect(f.state.requests).toEqual([]);
  });
  it('an MX record is sent with its priority', async () => {
    const f = setup();
    await add({ confirm: true, type: 'MX', name: '@', value: 'mx.example.test', mxPriority: 10 }, f);
    expect(changing(f.state)[0].body).toMatchObject({ name: '', type: 'MX', mxPriority: 10 });
  });
  it('refuses a domain hosted elsewhere, with nothing changed', async () => {
    const f = setup({ ns: ['ns.godaddy.test'] });
    await expect(add({ confirm: true }, f)).rejects.toThrow(/does not use Vercel for DNS/);
    expect(f.state.requests).toEqual([]);
  });
  it('a missing token says how to set it; a rejected token says so', async () => {
    await expect(add({ confirm: true }, setup({ token: '' }))).rejects.toThrow(/VERCEL_API_TOKEN/);
    await expect(add({ confirm: true }, setup({ failStatus: 403 }))).rejects.toThrow(/refused the token/);
  });
});

describe('dns_delete_record', () => {
  const rec = { id: 'r1', name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=none', ttl: 60 };
  it('shows which record it will remove and needs confirm', async () => {
    const f = setup({ records: [rec] });
    const out = body(await registry.handlers.dns_delete_record({ domain: D, recordId: 'r1' }, f.clients));
    expect(out).toMatchObject({ needsConfirmation: true, before: { record: { id: 'r1', type: 'TXT' } } });
    expect(changing(f.state)).toEqual([]);
  });
  it('deletes only that record and confirms it is gone', async () => {
    const f = setup({ records: [rec, { id: 'r2', name: '', type: 'A', value: '1.2.3.4', ttl: 60 }] });
    const out = body(await registry.handlers.dns_delete_record({ domain: D, recordId: 'r1', confirm: true }, f.clients));
    expect(out).toMatchObject({ done: true, confirmed: true });
    expect(f.state.records.map((r) => r.id)).toEqual(['r2']);
    expect(changing(f.state)).toEqual([expect.objectContaining({ method: 'DELETE', path: `/v2/domains/${D}/records/r1` })]);
  });
  it('an unknown record id deletes nothing', async () => {
    const f = setup({ records: [rec] });
    await expect(registry.handlers.dns_delete_record({ domain: D, recordId: 'nope', confirm: true }, f.clients)).rejects.toThrow(/No record with id nope/);
    expect(changing(f.state)).toEqual([]);
  });
});
