import { describe, it, expect } from 'vitest';
import { createFakeDb } from '../helpers/fake-db.js';
import { runDbContract } from '../contract/db-contract.js';
import * as realDb from '../../src/db.js';

runDbContract('in-memory fake', {
  makeDb: async () => createFakeDb(),
  seedLegacy: async (db, tokens) => db.__seedLegacyGoogleAuth(tokens)
});

describe('the fake database', () => {
  it('offers every function the real src/db.js exports, so a handler cannot work in tests and fail in production', () => {
    const fake = createFakeDb();
    const missing = Object.keys(realDb).filter((name) => typeof fake[name] !== 'function');
    expect(missing).toEqual([]);
  });

  it('respects the clock for token and login-code expiry', async () => {
    let now = Date.parse('2026-10-01T12:00:00Z');
    const db = createFakeDb({ clock: () => now });
    await db.createAccessToken({ accessToken: 'at', clientId: 'c', ttlSeconds: 60 });
    expect(await db.getAccessToken('at')).not.toBeNull();
    now += 61 * 1000;
    expect(await db.getAccessToken('at')).toBeNull();
  });
});
