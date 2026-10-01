import { describe, it, expect } from 'vitest';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';

describe('fake Google clients', () => {
  it('records any method path with its arguments and returns an empty result by default', async () => {
    const { clients, calls } = makeFakeClients();
    const result = await clients.gmail.users.settings.sendAs.list({ userId: 'me' });
    expect(result).toEqual({ data: {} });
    expect(calls).toEqual([{ path: 'gmail.users.settings.sendAs.list', args: [{ userId: 'me' }] }]);
  });

  it('returns what a test configured, one-off answers first', async () => {
    const { clients, when } = makeFakeClients();
    when('drive.files.get').resolves({ data: { id: 'always' } });
    when('drive.files.get').resolvesOnce({ data: { id: 'first' } });
    expect((await clients.drive.files.get({})).data.id).toBe('first');
    expect((await clients.drive.files.get({})).data.id).toBe('always');
  });

  it('can compute an answer from the arguments', async () => {
    const { clients, when } = makeFakeClients();
    when('drive.files.get').resolves(({ fileId }) => ({ data: { id: fileId } }));
    expect((await clients.drive.files.get({ fileId: 'abc' })).data.id).toBe('abc');
  });

  it('simulates Google errors in the shape the real library throws', async () => {
    const { clients, when } = makeFakeClients();
    when('admin.users.get').rejects(googleError(404, 'notFound', 'Resource Not Found: userKey'));
    const err = await clients.admin.users.get({}).catch((e) => e);
    expect(err.response.data.error.errors[0].reason).toBe('notFound');
    expect(err.response.data.error.code).toBe(404);
  });

  it('can be awaited as a whole without hanging, and knows who it acts as', async () => {
    const { clients } = makeFakeClients({ actingAs: 'ops@example.test' });
    expect(await Promise.resolve(clients.gmail)).toBe(clients.gmail);
    expect(clients.actingAs).toBe('ops@example.test');
  });
});
