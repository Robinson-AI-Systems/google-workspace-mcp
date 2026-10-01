import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { defineWrite, guard, gone } = await import('../../src/tools/write.js');
const { ok } = await import('../../src/tools/util.js');

const body = (r) => JSON.parse(r.content[0].text);
beforeEach(() => { holder.db = createFakeDb(); });

function build({ destructive = false, applyImpl, readAfter, readBefore } = {}) {
  const apply = vi.fn(applyImpl || (async () => ok({ changed: true })));
  const built = defineWrite({
    name: 'thing_change', description: 'Changes a thing.', destructive,
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    plan: (a) => ({ summary: `Change ${a.id}`, target: a.id, readBefore: readBefore || (async () => ({ value: 'old' })) }),
    apply,
    readAfter: readAfter || (async () => ({ value: 'new' }))
  });
  return { ...built, apply };
}

describe('defineWrite: schema', () => {
  it('adds dryRun to every tool and confirm only to destructive ones, without touching the original schema', () => {
    const plain = build().tool.inputSchema.properties;
    const hard = build({ destructive: true }).tool.inputSchema.properties;
    expect(plain.dryRun.type).toBe('boolean');
    expect(plain.confirm).toBeUndefined();
    expect(hard.confirm.type).toBe('boolean');
    expect(build({ destructive: true }).tool.description).toMatch(/confirm: true/);
  });
});

describe('defineWrite: dry run', () => {
  it('never applies the change, says what it would do, and logs a preview marked as one', async () => {
    const { handler, apply } = build();
    const { clients } = makeFakeClients();
    const out = body(await handler({ id: 'x1', dryRun: true }, clients));
    expect(apply).not.toHaveBeenCalled();
    expect(out).toMatchObject({ done: false, dryRun: true, summary: 'Change x1', before: { value: 'old' }, logged: true });
    const [row] = await holder.db.listRecentChanges();
    expect(row).toMatchObject({ tool: 'thing_change', dry_run: true, target: 'x1' });
    expect(row.summary).toMatch(/^PREVIEW/);
    expect(await holder.db.listRecentChanges({ includeDryRuns: false })).toEqual([]);
  });
});

describe('defineWrite: destructive tools', () => {
  it('refuse to act without confirm, show what is at stake, and log nothing', async () => {
    const { handler, apply } = build({ destructive: true });
    const { clients } = makeFakeClients();
    for (const args of [{ id: 'x' }, { id: 'x', confirm: false }, { id: 'x', confirm: 'true' }, { id: 'x', confirm: 1 }]) {
      const out = body(await handler(args, clients));
      expect(out).toMatchObject({ done: false, needsConfirmation: true, before: { value: 'old' } });
    }
    expect(apply).not.toHaveBeenCalled();
    expect(await holder.db.listRecentChanges()).toEqual([]);
  });

  it('go ahead with confirm: true', async () => {
    const { handler, apply } = build({ destructive: true });
    const out = body(await handler({ id: 'x', confirm: true }, makeFakeClients().clients));
    expect(apply).toHaveBeenCalledTimes(1);
    expect(out.done).toBe(true);
  });

  it('a dry run wins over confirm: true', async () => {
    const { handler, apply } = build({ destructive: true });
    await handler({ id: 'x', confirm: true, dryRun: true }, makeFakeClients().clients);
    expect(apply).not.toHaveBeenCalled();
  });
});

describe('defineWrite: after the change', () => {
  it('returns what Google holds now, not what was sent, and records before and after', async () => {
    const { handler } = build({ readAfter: async () => ({ value: 'what google says' }) });
    const out = body(await handler({ id: 'x' }, makeFakeClients({ actingAs: 'ops@example.test' }).clients));
    expect(out).toMatchObject({ done: true, confirmed: true, before: { value: 'old' }, after: { value: 'what google says' }, details: { changed: true }, logged: true });
    const [row] = await holder.db.listRecentChanges();
    expect(row).toMatchObject({ acting_as: 'ops@example.test', dry_run: false, before: { value: 'old' }, after: { value: 'what google says' } });
  });

  it('says "not confirmed" when the read-back fails, and still logs the change that happened', async () => {
    const { handler } = build({ readAfter: async () => { throw googleError(500, 'backendError', 'boom'); } });
    const out = body(await handler({ id: 'x' }, makeFakeClients().clients));
    expect(out.done).toBe(true);
    expect(out.confirmed).toBe(false);
    expect(out.after.unreadable).toMatch(/boom/);
    expect((await holder.db.listRecentChanges())[0].summary).toMatch(/could not confirm/);
  });

  it('says "not confirmed" when a deleted thing is still there', async () => {
    const { handler } = build({ destructive: true, readAfter: async () => ({ exists: true }) });
    expect(body(await handler({ id: 'x', confirm: true }, makeFakeClients().clients)).confirmed).toBe(false);
  });

  it('an error from the change itself propagates and nothing is logged', async () => {
    const { handler } = build({ applyImpl: async () => { throw googleError(403, 'forbidden', 'nope'); } });
    await expect(handler({ id: 'x' }, makeFakeClients().clients)).rejects.toThrow('nope');
    expect(await holder.db.listRecentChanges()).toEqual([]);
  });

  it('a failure to read the "before" state does not block the change', async () => {
    const { handler, apply } = build({ readBefore: async () => { throw new Error('cannot read'); } });
    const out = body(await handler({ id: 'x' }, makeFakeClients().clients));
    expect(apply).toHaveBeenCalled();
    expect(out.before.unreadable).toMatch(/cannot read/);
  });

  it('still returns the result when the change log is down', async () => {
    holder.db.recordChange = async () => { throw new Error('db down'); };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const out = body(await build().handler({ id: 'x' }, makeFakeClients().clients));
    expect(out).toMatchObject({ done: true, logged: false });
    warn.mockRestore();
  });

  it('never stores secrets that appear in before/after', async () => {
    const { handler } = build({ readAfter: async () => ({ password: 'hunter2', note: 'fine' }) });
    await handler({ id: 'x' }, makeFakeClients().clients);
    const [row] = await holder.db.listRecentChanges();
    expect(row.after).toEqual({ password: '[redacted]', note: 'fine' });
  });
});

describe('guard: wrapping an existing tool', () => {
  const tool = { name: 'old_tool', description: 'Old.', inputSchema: { type: 'object', properties: { id: { type: 'string' } } } };

  it('hands the old handler its arguments WITHOUT dryRun/confirm (some tools pass args straight to Google)', async () => {
    const old = vi.fn(async () => ok({ fine: true }));
    const { handler } = guard(tool, old, { destructive: true, describe: (a) => ({ summary: `s ${a.id}`, target: a.id }) });
    await handler({ id: 'q', confirm: true }, makeFakeClients().clients);
    expect(old).toHaveBeenCalledWith({ id: 'q' }, expect.anything());
  });

  it('keeps confirm for tools that already required it themselves', async () => {
    const old = vi.fn(async () => ok({}));
    const withConfirm = { ...tool, inputSchema: { type: 'object', properties: { id: { type: 'string' }, confirm: { type: 'boolean' } } } };
    const { handler } = guard(withConfirm, old, { destructive: true, describe: () => ({ summary: 's' }) });
    await handler({ id: 'q', confirm: true }, makeFakeClients().clients);
    expect(old).toHaveBeenCalledWith({ id: 'q', confirm: true }, expect.anything());
  });
});

describe('gone()', () => {
  const clients = {};
  it('reports gone on not-found, present when still readable, and rethrows other errors', async () => {
    expect(await gone(async () => { throw googleError(404, 'notFound', 'x'); })({}, clients)).toEqual({ exists: false });
    expect((await gone(async () => ({ id: 1 }))({}, clients)).exists).toBe(true);
    await expect(gone(async () => { throw googleError(500, 'backendError', 'boom'); })({}, clients)).rejects.toThrow('boom');
  });
  it('treats a calendar event Google marks cancelled as gone', async () => {
    expect((await gone(async () => ({ status: 'cancelled' }))({}, clients)).exists).toBe(false);
  });
});
