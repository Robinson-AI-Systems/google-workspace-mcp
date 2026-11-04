// VER-1: one release-identity resolver feeds the MCP handshake version and
// workspace_whoami's server_release, so the two can never drift apart.
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';
import { serverRelease, deployedCommit } from '../../src/release.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { handlers } = await import('../../src/tools/accounts.js');
const text = (result) => result.content[0].text;
const SHA = 'a76a7544766b12805e3ae4477058d7429ccdc749';

describe('serverRelease resolver', () => {
  it('formats version, commit and source from a known deployment SHA', () => {
    const rel = serverRelease({ VERCEL_GIT_COMMIT_SHA: SHA });
    expect(rel.commit).toBe(SHA);
    expect(rel.version).toBe(`2.0.0+${SHA.slice(0, 12)}`);
    expect(rel.source).toBe(`https://github.com/Robinson-AI-Systems/google-workspace-mcp/commit/${SHA}`);
    expect(rel.what_changed).toContain('/commits/live');
  });

  it('reports the commit as unknown (null) when no SHA is present — never a guess', () => {
    const rel = serverRelease({});
    expect(rel.commit).toBeNull();
    expect(rel.version).toBe('2.0.0');
    expect(rel.source).toBeNull();
  });

  it('rejects a malformed SHA instead of trusting it', () => {
    expect(deployedCommit({ VERCEL_GIT_COMMIT_SHA: 'main' })).toBeNull();
    expect(deployedCommit({ VERCEL_GIT_COMMIT_SHA: SHA.toUpperCase() })).toBeNull();
    expect(serverRelease({ VERCEL_GIT_COMMIT_SHA: 'deadbeef' }).commit).toBeNull();
  });
});

describe('release identity agreement', () => {
  it('workspace_whoami carries server_release from the same resolver', async () => {
    holder.db = createFakeDb();
    await holder.db.saveGoogleTokensFor('ops@robinsonaisystems.test', { access_token: <redacted> });
    const { clients, when } = makeFakeClients({ actingAs: 'ops@robinsonaisystems.test' });
    when('gmail.users.getProfile').resolves({ data: { emailAddress: 'ops@robinsonaisystems.test', messagesTotal: 7 } });
    const out = JSON.parse(text(await handlers.workspace_whoami({}, clients)));
    expect(out.server_release).toEqual(serverRelease());
    expect(out.server_release.version).toBe(serverRelease().version);
  });

  it('the MCP handshake takes its version from the resolver, not a hardcoded string', () => {
    const src = readFileSync(new URL('../../api/mcp.js', import.meta.url), 'utf8');
    expect(src).toContain('version: serverRelease().version');
    expect(src).not.toContain("version: '1.0.0'");
  });
});
