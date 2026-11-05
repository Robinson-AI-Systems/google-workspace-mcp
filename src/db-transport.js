// Store transport: the one place that decides how this server's own
// Postgres store (Google login tokens, the connector's OAuth state, the
// principal store) is reached. Every module that used to build its own
// handle with `neon(process.env.DATABASE_URL)` now builds it here, so the
// driver choice is made exactly once. Two drivers implement the exact
// same handle contract — a tagged-template query function that resolves
// to an array of row objects, plus a .query(text, values) method with
// the same row contract — so no caller knows which store it is talking
// to:
//
//   neon — the @neondatabase/serverless HTTP driver. This is the driver
//     production has always used, and it stays the default: with no
//     STORE_TRANSPORT declared, every handle this module returns is the
//     Neon handle, byte-identical to the pre-seam behavior.
//   pg — a pooled node-postgres client for a plain Postgres store (the
//     Development Rack). This is the test/helpers/pg-neon-adapter.js
//     pattern promoted into src/: the repo's whole db test-suite already
//     runs the real store layer through this exact query shape against
//     ordinary Postgres, so the promotion lifts a proven seam, it does
//     not invent one.
//
// Selection is a deployment declaration, never a guess: STORE_TRANSPORT
// must say "pg" for the pg driver to be used. Unlike a hostname rule,
// an explicit declaration cannot silently switch drivers because a URL
// changed shape, and it keeps the db test-suite's contract intact (the
// suite substitutes the neon module to prove the store layer against
// plain Postgres; an automatic hostname switch would route around that
// substitution). The rack deployment declares STORE_TRANSPORT=pg in its
// environment; Vercel declares nothing and gets the Neon driver.
import { neon } from '@neondatabase/serverless';
import pg from 'pg';

export const STORE_TRANSPORTS = Object.freeze(['neon', 'pg']);

export function selectStoreTransport(env = process.env) {
  const declared = String(env.STORE_TRANSPORT ?? '').trim().toLowerCase();
  if (!declared) return 'neon';
  if (!STORE_TRANSPORTS.includes(declared)) {
    throw new Error('STORE_TRANSPORT must be "neon" or "pg" when set.');
  }
  return declared;
}

const pools = new Map();

function poolFor(url) {
  let entry = pools.get(url);
  if (!entry) {
    // A long-lived standalone process reuses one small pool per store
    // URL; the serverless driver needs no pool because each call is an
    // independent HTTP request. Handles are created per caller (several
    // modules keep their own), so the pool — and its ended state — is
    // shared by every handle for a URL.
    entry = { pool: new pg.Pool({ connectionString: url, max: 5, idleTimeoutMillis: 30_000 }), ended: false };
    pools.set(url, entry);
  }
  return entry;
}

// The pg half of the handle contract. Rows come back as plain objects
// (node-postgres default), matching the Neon driver's row shape; pg
// error codes (e.g. 23505, with .constraint) ride the thrown error
// unchanged, as they do through the Neon driver — src/db.js's
// concurrent-DDL retry reads exactly those fields.
export function pgStoreSql(url) {
  const entry = poolFor(url);
  const { pool } = entry;
  const sql = async (strings, ...values) => {
    const text = strings.reduce((acc, part, i) => (i === 0 ? part : `${acc}$${i}${part}`), '');
    const { rows } = await pool.query(text, values);
    return rows;
  };
  sql.query = async (text, values = []) => (await pool.query(text, values)).rows;
  sql.end = async () => {
    if (entry.ended) return;
    entry.ended = true;
    pools.delete(url);
    await pool.end();
  };
  return sql;
}

// The store handle for one call site. Call sites keep their own
// missing-DATABASE_URL guards (and their own error wording) and pass
// the URL in. The Neon branch passes the URL through untouched, so
// its construction behavior (including the driver's own error for a
// missing connection string) is exactly what call sites got when
// they invoked neon() directly. The pg branch refuses a missing
// URL outright: a declared pg transport with no target must fail
// closed, never fall back to node-postgres' environment defaults,
// which could silently point at the wrong database.
export function storeSql(url, env = process.env) {
  if (selectStoreTransport(env) === 'pg') {
    if (!url) {
      throw new Error('DATABASE_URL is not set. STORE_TRANSPORT=pg requires an explicit store URL.');
    }
    return pgStoreSql(url);
  }
  return neon(url);
}
