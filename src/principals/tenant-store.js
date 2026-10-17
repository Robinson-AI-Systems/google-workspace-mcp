// Principal-owned persistence for public MCP requests. This module is only
// constructed from scopedStore's server-minted, WeakSet-verified AuthContext.
// Neither provider arguments nor cookies may supply its ownership keys.
import { neon } from '@neondatabase/serverless';
import { validUuid, requireScope } from './security.js';

let connection;
const sql = () => {
  if (!connection) {
    if (!process.env.DATABASE_URL) throw Error('database_unavailable');
    connection = neon(process.env.DATABASE_URL);
  }
  return connection;
};
const asJSON = value => value === undefined ? null : JSON.stringify(value);
const positiveInt = (n, max) => Number.isSafeInteger(n) && n >= 1 && n <= max;
const handlePattern = /^rtc_result_[A-Za-z0-9_-]{32}$/;

export async function initTenantSchema(q = sql()) {
  // Existing P10-B installations have the row but not its composite
  // owned-account relation. Additive twice-safe migration; no key is moved.
  await q`ALTER TABLE principal_delegations ADD COLUMN IF NOT EXISTS account_id UUID`;
  await q`DO $p10_fk$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='principal_delegations_owned_account_fk'
      AND conrelid='principal_delegations'::regclass) THEN
      ALTER TABLE principal_delegations ADD CONSTRAINT principal_delegations_owned_account_fk
        FOREIGN KEY (account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id);
    END IF;
  END $p10_fk$`;
  await q`CREATE TABLE IF NOT EXISTS principal_delegation_subjects (
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    customer_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(principal_id,customer_id,subject),
    FOREIGN KEY(principal_id,customer_id)
      REFERENCES principal_delegations(principal_id,customer_id) ON DELETE CASCADE,
    FOREIGN KEY(account_id,principal_id)
      REFERENCES principal_google_accounts(id,principal_id))`;
  await q`CREATE TABLE IF NOT EXISTS principal_result_pages (
    handle TEXT PRIMARY KEY,
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    credential_version INTEGER NOT NULL CHECK (credential_version>=0),
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  // A UUID foreign key alone does not prove the referenced connection belongs
  // to this same principal/account. Enforce the full triple in Postgres too:
  // raw SQL, retries and future import paths cannot misassociate audit,
  // pagination or counters even if an application caller is mistaken.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS principal_connections_owner_key
    ON principal_connections(id,principal_id,account_id)`;
  await q`CREATE INDEX IF NOT EXISTS principal_result_expiry ON principal_result_pages(expires_at)`;
  await q`CREATE INDEX IF NOT EXISTS principal_result_owner ON principal_result_pages
    (principal_id,account_id,connection_id,credential_version)`;
  await q`CREATE TABLE IF NOT EXISTS principal_changes (
    id BIGSERIAL PRIMARY KEY,
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    acting_as TEXT NOT NULL,
    tool TEXT NOT NULL,
    target TEXT,summary TEXT,
    before JSONB,after JSONB,
    dry_run BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  await q`CREATE INDEX IF NOT EXISTS principal_changes_owner ON principal_changes
    (principal_id,account_id,connection_id,created_at DESC)`;
  await q`CREATE TABLE IF NOT EXISTS principal_rate_windows (
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    credential_version INTEGER NOT NULL CHECK(credential_version>=0),
    bucket TEXT NOT NULL, window_start TIMESTAMPTZ NOT NULL,
    usage INTEGER NOT NULL CHECK(usage>=0),
    PRIMARY KEY(principal_id,account_id,connection_id,credential_version,bucket,window_start),
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  // Separate simple FKs allow mismatched existing user and connection rows.
  // This additive invariant protects the actual relationship across tables.
  for(const [table,constraint] of [
    ['principal_result_pages','p10_result_connection_owner'],
    ['principal_changes','p10_change_connection_owner'],
    ['principal_rate_windows','p10_rate_connection_owner']
  ]){
    // PostgreSQL identifiers are chosen only from this constant internal
    // allowlist; never interpolate request-owned SQL table/column strings.
    const safe=new Map([
      ['principal_result_pages','p10_result_connection_owner'],
      ['principal_changes','p10_change_connection_owner'],
      ['principal_rate_windows','p10_rate_connection_owner']
    ]);
    if(safe.get(table)!==constraint)throw Error('unsupported_owner_relation');
    if(table==='principal_result_pages'){
      await q`DO $p10$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='p10_result_connection_owner'
        AND conrelid='principal_result_pages'::regclass) THEN
        ALTER TABLE principal_result_pages ADD CONSTRAINT p10_result_connection_owner
          FOREIGN KEY(connection_id,principal_id,account_id)
          REFERENCES principal_connections(id,principal_id,account_id);
      END IF; END $p10// Principal-owned persistence for public MCP requests. This module is only
// constructed from scopedStore's server-minted, WeakSet-verified AuthContext.
// Neither provider arguments nor cookies may supply its ownership keys.
import { neon } from '@neondatabase/serverless';
import { validUuid, requireScope } from './security.js';

let connection;
const sql = () => {
  if (!connection) {
    if (!process.env.DATABASE_URL) throw Error('database_unavailable');
    connection = neon(process.env.DATABASE_URL);
  }
  return connection;
};
const asJSON = value => value === undefined ? null : JSON.stringify(value);
const positiveInt = (n, max) => Number.isSafeInteger(n) && n >= 1 && n <= max;
const handlePattern = /^rtc_result_[A-Za-z0-9_-]{32}$/;

export async function initTenantSchema(q = sql()) {
  // Existing P10-B installations have the row but not its composite
  // owned-account relation. Additive twice-safe migration; no key is moved.
  await q`ALTER TABLE principal_delegations ADD COLUMN IF NOT EXISTS account_id UUID`;
  await q`DO $p10_fk$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='principal_delegations_owned_account_fk'
      AND conrelid='principal_delegations'::regclass) THEN
      ALTER TABLE principal_delegations ADD CONSTRAINT principal_delegations_owned_account_fk
        FOREIGN KEY (account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id);
    END IF;
  END $p10_fk$`;
  await q`CREATE TABLE IF NOT EXISTS principal_delegation_subjects (
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    customer_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(principal_id,customer_id,subject),
    FOREIGN KEY(principal_id,customer_id)
      REFERENCES principal_delegations(principal_id,customer_id) ON DELETE CASCADE,
    FOREIGN KEY(account_id,principal_id)
      REFERENCES principal_google_accounts(id,principal_id))`;
  await q`CREATE TABLE IF NOT EXISTS principal_result_pages (
    handle TEXT PRIMARY KEY,
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    credential_version INTEGER NOT NULL CHECK (credential_version>=0),
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  // A UUID foreign key alone does not prove the referenced connection belongs
  // to this same principal/account. Enforce the full triple in Postgres too:
  // raw SQL, retries and future import paths cannot misassociate audit,
  // pagination or counters even if an application caller is mistaken.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS principal_connections_owner_key
    ON principal_connections(id,principal_id,account_id)`;
  await q`CREATE INDEX IF NOT EXISTS principal_result_expiry ON principal_result_pages(expires_at)`;
  await q`CREATE INDEX IF NOT EXISTS principal_result_owner ON principal_result_pages
    (principal_id,account_id,connection_id,credential_version)`;
  await q`CREATE TABLE IF NOT EXISTS principal_changes (
    id BIGSERIAL PRIMARY KEY,
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    acting_as TEXT NOT NULL,
    tool TEXT NOT NULL,
    target TEXT,summary TEXT,
    before JSONB,after JSONB,
    dry_run BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  await q`CREATE INDEX IF NOT EXISTS principal_changes_owner ON principal_changes
    (principal_id,account_id,connection_id,created_at DESC)`;
;
    }else if(table==='principal_changes'){
      await q`DO $p10$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='p10_change_connection_owner'
        AND conrelid='principal_changes'::regclass) THEN
        ALTER TABLE principal_changes ADD CONSTRAINT p10_change_connection_owner
          FOREIGN KEY(connection_id,principal_id,account_id)
          REFERENCES principal_connections(id,principal_id,account_id);
      END IF; END $p10// Principal-owned persistence for public MCP requests. This module is only
// constructed from scopedStore's server-minted, WeakSet-verified AuthContext.
// Neither provider arguments nor cookies may supply its ownership keys.
import { neon } from '@neondatabase/serverless';
import { validUuid, requireScope } from './security.js';

let connection;
const sql = () => {
  if (!connection) {
    if (!process.env.DATABASE_URL) throw Error('database_unavailable');
    connection = neon(process.env.DATABASE_URL);
  }
  return connection;
};
const asJSON = value => value === undefined ? null : JSON.stringify(value);
const positiveInt = (n, max) => Number.isSafeInteger(n) && n >= 1 && n <= max;
const handlePattern = /^rtc_result_[A-Za-z0-9_-]{32}$/;

export async function initTenantSchema(q = sql()) {
  // Existing P10-B installations have the row but not its composite
  // owned-account relation. Additive twice-safe migration; no key is moved.
  await q`ALTER TABLE principal_delegations ADD COLUMN IF NOT EXISTS account_id UUID`;
  await q`DO $p10_fk$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='principal_delegations_owned_account_fk'
      AND conrelid='principal_delegations'::regclass) THEN
      ALTER TABLE principal_delegations ADD CONSTRAINT principal_delegations_owned_account_fk
        FOREIGN KEY (account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id);
    END IF;
  END $p10_fk$`;
  await q`CREATE TABLE IF NOT EXISTS principal_delegation_subjects (
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    customer_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(principal_id,customer_id,subject),
    FOREIGN KEY(principal_id,customer_id)
      REFERENCES principal_delegations(principal_id,customer_id) ON DELETE CASCADE,
    FOREIGN KEY(account_id,principal_id)
      REFERENCES principal_google_accounts(id,principal_id))`;
  await q`CREATE TABLE IF NOT EXISTS principal_result_pages (
    handle TEXT PRIMARY KEY,
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    credential_version INTEGER NOT NULL CHECK (credential_version>=0),
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  // A UUID foreign key alone does not prove the referenced connection belongs
  // to this same principal/account. Enforce the full triple in Postgres too:
  // raw SQL, retries and future import paths cannot misassociate audit,
  // pagination or counters even if an application caller is mistaken.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS principal_connections_owner_key
    ON principal_connections(id,principal_id,account_id)`;
  await q`CREATE INDEX IF NOT EXISTS principal_result_expiry ON principal_result_pages(expires_at)`;
  await q`CREATE INDEX IF NOT EXISTS principal_result_owner ON principal_result_pages
    (principal_id,account_id,connection_id,credential_version)`;
  await q`CREATE TABLE IF NOT EXISTS principal_changes (
    id BIGSERIAL PRIMARY KEY,
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    acting_as TEXT NOT NULL,
    tool TEXT NOT NULL,
    target TEXT,summary TEXT,
    before JSONB,after JSONB,
    dry_run BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  await q`CREATE INDEX IF NOT EXISTS principal_changes_owner ON principal_changes
    (principal_id,account_id,connection_id,created_at DESC)`;
;
    }else{
      await q`DO $p10$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='p10_rate_connection_owner'
        AND conrelid='principal_rate_windows'::regclass) THEN
        ALTER TABLE principal_rate_windows ADD CONSTRAINT p10_rate_connection_owner
          FOREIGN KEY(connection_id,principal_id,account_id)
          REFERENCES principal_connections(id,principal_id,account_id);
      END IF; END $p10// Principal-owned persistence for public MCP requests. This module is only
// constructed from scopedStore's server-minted, WeakSet-verified AuthContext.
// Neither provider arguments nor cookies may supply its ownership keys.
import { neon } from '@neondatabase/serverless';
import { validUuid, requireScope } from './security.js';

let connection;
const sql = () => {
  if (!connection) {
    if (!process.env.DATABASE_URL) throw Error('database_unavailable');
    connection = neon(process.env.DATABASE_URL);
  }
  return connection;
};
const asJSON = value => value === undefined ? null : JSON.stringify(value);
const positiveInt = (n, max) => Number.isSafeInteger(n) && n >= 1 && n <= max;
const handlePattern = /^rtc_result_[A-Za-z0-9_-]{32}$/;

export async function initTenantSchema(q = sql()) {
  // Existing P10-B installations have the row but not its composite
  // owned-account relation. Additive twice-safe migration; no key is moved.
  await q`ALTER TABLE principal_delegations ADD COLUMN IF NOT EXISTS account_id UUID`;
  await q`DO $p10_fk$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='principal_delegations_owned_account_fk'
      AND conrelid='principal_delegations'::regclass) THEN
      ALTER TABLE principal_delegations ADD CONSTRAINT principal_delegations_owned_account_fk
        FOREIGN KEY (account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id);
    END IF;
  END $p10_fk$`;
  await q`CREATE TABLE IF NOT EXISTS principal_delegation_subjects (
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    customer_id TEXT NOT NULL,
    subject TEXT NOT NULL,
    verified_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY(principal_id,customer_id,subject),
    FOREIGN KEY(principal_id,customer_id)
      REFERENCES principal_delegations(principal_id,customer_id) ON DELETE CASCADE,
    FOREIGN KEY(account_id,principal_id)
      REFERENCES principal_google_accounts(id,principal_id))`;
  await q`CREATE TABLE IF NOT EXISTS principal_result_pages (
    handle TEXT PRIMARY KEY,
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    credential_version INTEGER NOT NULL CHECK (credential_version>=0),
    payload JSONB NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  // A UUID foreign key alone does not prove the referenced connection belongs
  // to this same principal/account. Enforce the full triple in Postgres too:
  // raw SQL, retries and future import paths cannot misassociate audit,
  // pagination or counters even if an application caller is mistaken.
  await q`CREATE UNIQUE INDEX IF NOT EXISTS principal_connections_owner_key
    ON principal_connections(id,principal_id,account_id)`;
  await q`CREATE INDEX IF NOT EXISTS principal_result_expiry ON principal_result_pages(expires_at)`;
  await q`CREATE INDEX IF NOT EXISTS principal_result_owner ON principal_result_pages
    (principal_id,account_id,connection_id,credential_version)`;
  await q`CREATE TABLE IF NOT EXISTS principal_changes (
    id BIGSERIAL PRIMARY KEY,
    principal_id UUID NOT NULL REFERENCES principals(id),
    account_id UUID NOT NULL,
    connection_id UUID NOT NULL REFERENCES principal_connections(id),
    acting_as TEXT NOT NULL,
    tool TEXT NOT NULL,
    target TEXT,summary TEXT,
    before JSONB,after JSONB,
    dry_run BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(account_id,principal_id) REFERENCES principal_google_accounts(id,principal_id))`;
  await q`CREATE INDEX IF NOT EXISTS principal_changes_owner ON principal_changes
    (principal_id,account_id,connection_id,created_at DESC)`;
;
    }
  }
}

// No exported argument can override these private closure-held identity fields.
// Each method also validates that this credential/account is still active;
// disconnect, account revocation and token rotation stop future access.
export function makeTenantStore(context) {
  const principalId = context.principalId;
  const accountId = context.accountId;
  const connectionId = context.connectionId;
  const credentialVersion = context.accountVersion;
  const actingAs = context.actingAs;
  requireScope(validUuid(principalId) && validUuid(accountId) &&
    validUuid(connectionId) && Number.isSafeInteger(credentialVersion) &&
    credentialVersion >= 0 && typeof actingAs === 'string', 'invalid_scoped_context');

  const current = async q => {
    const rows = await q`SELECT 1 FROM principal_connections c
      JOIN principals p ON p.id=c.principal_id
      JOIN principal_google_accounts a ON a.id=c.account_id AND a.principal_id=c.principal_id
      WHERE c.id=${connectionId}::uuid AND c.principal_id=${principalId}::uuid
        AND c.account_id=${accountId}::uuid AND c.revoked_at IS NULL AND c.expires_at>now()
        AND p.status='active' AND a.status='active'
        AND a.token_version=${credentialVersion}`;
    return rows.length === 1;
  };
  const assertCurrent = async q => requireScope(await current(q), 'invalid_scoped_context');

  return Object.freeze({
    async assertActive(){await assertCurrent(sql());return true;},
    async storeResult({handle, connection: _ignored, payload, ttlHours = 24}) {
      requireScope(typeof handle === 'string' && handlePattern.test(handle) &&
        positiveInt(ttlHours, 24) && payload !== undefined, 'invalid_result');
      const q=sql();
      await assertCurrent(q);
      const rows=await q`INSERT INTO principal_result_pages
        (handle,principal_id,account_id,connection_id,credential_version,payload,expires_at)
        SELECT ${handle},c.principal_id,c.account_id,c.id,${credentialVersion},
          ${asJSON(payload)}::jsonb,now()+(${ttlHours} * interval '1 hour')
        FROM principal_connections c JOIN principal_google_accounts a
          ON a.id=c.account_id AND a.principal_id=c.principal_id
        JOIN principals p ON p.id=c.principal_id
        WHERE c.id=${connectionId}::uuid AND c.principal_id=${principalId}::uuid
          AND c.account_id=${accountId}::uuid AND c.revoked_at IS NULL AND c.expires_at>now()
          AND p.status='active' AND a.status='active' AND a.token_version=${credentialVersion}
        RETURNING handle`;
      requireScope(rows.length===1,'invalid_scoped_context');
      return rows[0].handle;
    },
    async getResult(handle) {
      if (typeof handle !== 'string' || !handlePattern.test(handle)) return null;
      const q=sql();
      const rows=await q`SELECT r.payload FROM principal_result_pages r
        JOIN principal_connections c ON c.id=r.connection_id
        JOIN principals p ON p.id=r.principal_id
        JOIN principal_google_accounts a ON a.id=r.account_id AND a.principal_id=r.principal_id
        WHERE r.handle=${handle} AND r.principal_id=${principalId}::uuid
          AND r.account_id=${accountId}::uuid AND r.connection_id=${connectionId}::uuid
          AND r.credential_version=${credentialVersion}
          AND a.token_version=${credentialVersion} AND r.expires_at>now()
          AND c.revoked_at IS NULL AND c.expires_at>now()
          AND p.status='active' AND a.status='active'`;
      return rows.length===1?rows[0].payload:null;
    },
    async recordChange({tool,target,summary,before,after,dryRun=false}) {
      requireScope(typeof tool==='string' && tool.length>0 && tool.length<256 &&
        (target==null||typeof target==='string') &&
        (summary==null||typeof summary==='string'), 'invalid_change');
      const q=sql();
      await assertCurrent(q);
      const rows=await q`INSERT INTO principal_changes
        (principal_id,account_id,connection_id,acting_as,tool,target,summary,before,after,dry_run)
        SELECT c.principal_id,c.account_id,c.id,${actingAs},${tool},${target??null},
          ${summary??null},${asJSON(before)}::jsonb,${asJSON(after)}::jsonb,${dryRun===true}
        FROM principal_connections c JOIN principals p ON p.id=c.principal_id
        JOIN principal_google_accounts a ON a.id=c.account_id AND a.principal_id=c.principal_id
        WHERE c.id=${connectionId}::uuid AND c.principal_id=${principalId}::uuid
          AND c.account_id=${accountId}::uuid AND c.revoked_at IS NULL AND c.expires_at>now()
          AND p.status='active' AND a.status='active' AND a.token_version=${credentialVersion}
        RETURNING id`;
      requireScope(rows.length===1,'invalid_scoped_context');
      return Number(rows[0].id);
    },
    async listChanges({since,tool,actingAs:filter,limit=50,includeDryRuns=false}={}) {
      requireScope(positiveInt(limit,100) && (!filter||filter===actingAs),'outside_scope');
      const q=sql();
      if (!await current(q)) return [];
      return q`SELECT id,created_at,acting_as,tool,target,summary,before,after,dry_run
        FROM principal_changes WHERE principal_id=${principalId}::uuid
          AND account_id=${accountId}::uuid AND connection_id=${connectionId}::uuid
          AND (${since??null}::timestamptz IS NULL OR created_at>=${since??null}::timestamptz)
          AND (${tool??null}::text IS NULL OR tool=${tool??null})
          AND (${includeDryRuns} OR NOT dry_run)
        ORDER BY created_at DESC LIMIT ${limit}`;
    },
    async getOwnedChange(id) {
      if(!positiveInt(id,Number.MAX_SAFE_INTEGER)) return null;
      const q=sql();
      if(!await current(q))return null;
      const rows=await q`SELECT id,acting_as,tool,target,summary,before,after,dry_run,
        ${connectionId}::text AS connection FROM principal_changes
        WHERE id=${id} AND principal_id=${principalId}::uuid
          AND account_id=${accountId}::uuid AND connection_id=${connectionId}::uuid`;
      return rows[0]||null;
    },
    async chargeRate(bucket,windowStart,limit) {
      requireScope(typeof bucket==='string'&&bucket.length>0&&bucket.length<=120 &&
        windowStart instanceof Date && Number.isFinite(windowStart.getTime()) &&
        positiveInt(limit,100000), 'invalid_rate');
      const q=sql();
      if(!await current(q))return {allowed:false,reason:'revoked'};
      const rows=await q`INSERT INTO principal_rate_windows
        (principal_id,account_id,connection_id,credential_version,bucket,window_start,usage)
        VALUES (${principalId}::uuid,${accountId}::uuid,${connectionId}::uuid,
          ${credentialVersion},${bucket},${windowStart.toISOString()}::timestamptz,1)
        ON CONFLICT(principal_id,account_id,connection_id,credential_version,bucket,window_start)
        DO UPDATE SET usage=principal_rate_windows.usage+1
        WHERE principal_rate_windows.usage<${limit}
        RETURNING usage`;
      return rows.length?{allowed:true,usage:rows[0].usage}:{allowed:false,reason:'rate_limited'};
    }
  });
}
