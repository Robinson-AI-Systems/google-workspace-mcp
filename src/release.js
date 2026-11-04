// VER-1 release identity: one resolver for "which release is running", so
// the MCP handshake, workspace_whoami and every other identity surface agree.
// The version comes from the installed package.json; the commit comes from
// the deployment's own build metadata (Vercel sets VERCEL_GIT_COMMIT_SHA per
// deployment). Nothing is taken from a branch head, a request header or a
// guess: an unusable SHA is reported as unknown (null), never synthesized.
import { readFileSync } from 'node:fs';

let pkgVersion = null;
try {
  pkgVersion = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version || null;
} catch { /* surfaced as 'unknown' below rather than a wrong version */ }

const SHA40 = /^[0-9a-f]{40}$/;

export function deployedCommit(env = process.env) {
  const sha = env.VERCEL_GIT_COMMIT_SHA;
  return typeof sha === 'string' && SHA40.test(sha) ? sha : null;
}

export function serverRelease(env = process.env) {
  const commit = deployedCommit(env);
  const base = pkgVersion || 'unknown';
  return {
    version: commit ? `${base}+${commit.slice(0, 12)}` : base,
    commit,
    source: commit ? `https://github.com/Robinson-AI-Systems/google-workspace-mcp/commit/${commit}` : null,
    // The deployed channel is the checked `live` branch, never main.
    what_changed: 'https://github.com/Robinson-AI-Systems/google-workspace-mcp/commits/live'
  };
}
