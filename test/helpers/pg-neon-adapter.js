// Lets the REAL src/db.js run against any ordinary Postgres in tests.
//
// src/db.js talks to Neon through `neon(url)`, which returns a tagged-template
// query function. Here the tests swap that for the same shape backed by a plain
// `pg` connection (see test/db/*.test.js, which mocks '@neondatabase/serverless').
//
// Isolation: every run creates its own throwaway schema and points the
// connection at it, so the tables src/db.js creates never touch anything that
// already exists in the database, and the whole schema is dropped afterwards.
import crypto from 'node:crypto';
import pg from 'pg';

let client = null;
let schemaName = null;

export async function openIsolatedSchema(connectionString) {
  if (client) throw new Error('An isolated schema is already open.');
  client = new pg.Client({ connectionString });
  await client.connect();
  schemaName = `gwmcp_test_${crypto.randomBytes(6).toString('hex')}`;
  await client.query(`CREATE SCHEMA ${schemaName}`);
  await client.query(`SET search_path TO ${schemaName}`);
  return schemaName;
}

export async function closeIsolatedSchema() {
  if (!client) return;
  try { await client.query(`DROP SCHEMA IF EXISTS ${schemaName} CASCADE`); } finally { await client.end(); client = null; schemaName = null; }
}

/** Run plain SQL on the same connection (same isolated schema). */
export async function rawQuery(text, params = []) {
  if (!client) throw new Error('Open an isolated schema first.');
  return (await client.query(text, params)).rows;
}

/** Same call shape as the `neon()` result: sql`SELECT ${x}` -> rows. */
export function neonShapedQuery() {
  return async (strings, ...values) => {
    let text = strings[0];
    for (let i = 0; i < values.length; i++) text += `$${i + 1}${strings[i + 1]}`;
    return rawQuery(text, values);
  };
}
