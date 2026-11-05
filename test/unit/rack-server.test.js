// RACK-2 proof: the rack entrypoint's route table is the Vercel
// contract, pinned two ways — every api/**/*.js file in the tree has
// a file route (a handler added without a route fails this test), and
// every vercel.json rewrite resolves to the handler and injected
// query parameters it names. Plus the release-pin rules: a valid
// platform value is never overwritten, a declared rack pin is
// adopted, and no pin is ever synthesized from garbage.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { FILE_ROUTES, resolveRoute, bodyLimitBytes, pinReleaseCommit } from '../../rack-server.mjs';
import frontDoor from '../../api/index.js';
import rtcGateway from '../../api/rtc-gateway.js';
import wellKnownAS from '../../api/well-known/oauth-authorization-server.js';
import wellKnownPR from '../../api/well-known/oauth-protected-resource.js';

function apiFiles(dir = new URL('../../api/', import.meta.url), prefix = '/api') {
  const paths = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) paths.push(...apiFiles(new URL(`${entry.name}/`, dir), `${prefix}/${entry.name}`));
    else if (entry.name.endsWith('.js')) paths.push(`${prefix}/${entry.name.slice(0, -3)}`);
  }
  return paths;
}

describe('rack entrypoint route table', () => {
  it('binds every api function file at its Vercel path', () => {
    const files = apiFiles();
    expect(files.length).toBeGreaterThanOrEqual(27);
    for (const path of files) expect(FILE_ROUTES.has(path), `missing route for ${path}`).toBe(true);
    // The front door also answers at its directory path.
    expect(FILE_ROUTES.get('/api').handler).toBe(frontDoor);
    expect(FILE_ROUTES.get('/api/index').handler).toBe(frontDoor);
  });

  it('resolves the vercel.json rewrites verbatim', () => {
    const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));
    const bySource = new Map(vercel.rewrites.map((r) => [r.source, r.destination]));
    expect(resolveRoute('/').handler).toBe(frontDoor);
    expect(bySource.get('/')).toBe('/api/index');
    expect(resolveRoute('/.well-known/oauth-authorization-server').handler).toBe(wellKnownAS);
    expect(resolveRoute('/.well-known/oauth-protected-resource').handler).toBe(wellKnownPR);
    const door = (path, query) => {
      const resolved = resolveRoute(path);
      expect(resolved.handler).toBe(rtcGateway);
      expect(resolved.query).toEqual(query);
    };
    door('/api/contract', { door: 'contract' });
    door('/api/openapi.json', { door: 'openapi' });
    door('/api/whoami', { door: 'whoami' });
    door('/api/tools', { door: 'tools' });
    door('/api/tools/workspace_whoami', { tool: 'workspace_whoami' });
    door('/api/results/res_abc123', { result: 'res_abc123' });
    expect(bySource.get('/api/tools/:tool')).toBe('/api/rtc-gateway?tool=:tool');
    expect(bySource.get('/api/results/:result')).toBe('/api/rtc-gateway?result=:result');
    expect(resolveRoute('/api/definitely-not-a-route')).toBeNull();
  });

  it('computes body limits from the exported function configs', () => {
    const mcpRoute = FILE_ROUTES.get('/api/mcp');
    expect(bodyLimitBytes(mcpRoute.config)).toBe(4_572_800);
    expect(bodyLimitBytes(undefined)).toBe(4_572_800);
    expect(bodyLimitBytes({ api: { bodyParser: false } })).toBe(0);
    expect(bodyLimitBytes({ api: { bodyParser: { sizeLimit: '1mb' } } })).toBe(1_048_576);
    expect(bodyLimitBytes({ api: { bodyParser: { sizeLimit: 2048 } } })).toBe(2048);
  });
});

describe('rack release pin', () => {
  const SHA = 'b'.repeat(40);
  it('keeps a valid platform-provided commit untouched', () => {
    const env = { VERCEL_GIT_COMMIT_SHA: SHA, RACK_RELEASE_COMMIT: 'c'.repeat(40) };
    expect(pinReleaseCommit(env)).toBe(SHA);
    expect(env.VERCEL_GIT_COMMIT_SHA).toBe(SHA);
  });
  it('adopts a declared rack pin when the platform set none', () => {
    const env = { RACK_RELEASE_COMMIT: SHA };
    expect(pinReleaseCommit(env)).toBe(SHA);
    expect(env.VERCEL_GIT_COMMIT_SHA).toBe(SHA);
  });
  it('never synthesizes a commit from an unusable pin', () => {
    const env = { RACK_RELEASE_COMMIT: 'not-a-sha' };
    // No release-commit.txt exists beside the entrypoint in the repo,
    // so an unusable env pin leaves the identity honestly unpinned.
    expect(pinReleaseCommit(env)).toBeNull();
    expect(env.VERCEL_GIT_COMMIT_SHA).toBeUndefined();
  });
});
