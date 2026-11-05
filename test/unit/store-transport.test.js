import { describe, it, expect } from 'vitest';
import { STORE_TRANSPORTS, selectStoreTransport, storeSql, pgStoreSql } from '../../src/db-transport.js';

const NEON_URL = 'postgres://fixture@ep-example-123.us-east-1.neon.tech/neondb';
const LOCAL_URL = 'postgres://localhost:5432/neondb';

describe('store transport selection', () => {
  it('defaults to the Neon driver for every URL shape when nothing is declared', () => {
    expect(selectStoreTransport({})).toBe('neon');
    expect(selectStoreTransport({ DATABASE_URL: NEON_URL })).toBe('neon');
    // A plain-Postgres URL alone never switches drivers: the move to pg
    // is a deployment declaration (STORE_TRANSPORT=pg), so a URL change
    // can never silently reroute production, and the db test-suite's
    // neon-module substitution keeps its meaning.
    expect(selectStoreTransport({ DATABASE_URL: LOCAL_URL })).toBe('neon');
  });

  it('lets an explicit STORE_TRANSPORT win, and refuses unknown values', () => {
    expect(selectStoreTransport({ STORE_TRANSPORT: 'pg', DATABASE_URL: NEON_URL })).toBe('pg');
    expect(selectStoreTransport({ STORE_TRANSPORT: 'neon', DATABASE_URL: LOCAL_URL })).toBe('neon');
    expect(selectStoreTransport({ STORE_TRANSPORT: ' PG ' })).toBe('pg');
    expect(() => selectStoreTransport({ STORE_TRANSPORT: 'socket' }))
      .toThrow(/STORE_TRANSPORT must be "neon" or "pg"/);
    expect(STORE_TRANSPORTS).toEqual(['neon', 'pg']);
  });

  it('fails closed on a declared pg transport without a store URL', () => {
    expect(() => storeSql(undefined, { STORE_TRANSPORT: 'pg' })).toThrow(/DATABASE_URL is not set/);
    expect(() => storeSql('', { STORE_TRANSPORT: 'pg' })).toThrow(/DATABASE_URL is not set/);
    // The Neon branch passes the URL through untouched, so a missing
    // URL fails with the driver's own construction error — exactly as
    // it did when call sites invoked neon() directly.
    expect(() => storeSql(undefined, {})).toThrow(/No database connection string was provided/);
  });

  it('builds handles with the shared contract without opening a connection', async () => {
    const neonHandle = storeSql(NEON_URL, {});
    expect(typeof neonHandle).toBe('function');
    const pgHandle = storeSql(LOCAL_URL, { STORE_TRANSPORT: 'pg' });
    expect(typeof pgHandle).toBe('function');
    expect(typeof pgHandle.query).toBe('function');
    expect(typeof pgHandle.end).toBe('function');
    await pgHandle.end();
    // Handles for one URL share the pool and its ended state: a second
    // handle's end() after the first is a no-op, not an error.
    const direct = pgStoreSql(LOCAL_URL);
    expect(typeof direct).toBe('function');
    await direct.end();
  });
});
