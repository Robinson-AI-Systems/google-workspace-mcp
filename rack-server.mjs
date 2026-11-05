#!/usr/bin/env node
// Development Rack entrypoint (RACK-2): the thin standalone HTTP server
// that runs this service outside Vercel. It reproduces, route for
// route, the platform contract the api/ functions are written against:
//
//   - filesystem binding: every api/**/*.js default export serves at
//     its /api/* path, exactly as Vercel binds function files (an
//     index.js also serves at its directory path, so the front door
//     answers at /api/index and /api);
//   - the vercel.json rewrites, verbatim: / to the front door, the two
//     /.well-known OAuth documents, and the RTC doors /api/contract,
//     /api/openapi.json, /api/whoami, /api/tools, /api/tools/:tool,
//     /api/results/:result onto api/rtc-gateway.js (rewrite-injected
//     query parameters win over the request's own, as on Vercel);
//   - the (req, res) surface the handlers use: req.method / headers /
//     query / body (parsed per each function's exported bodyParser
//     config, with Vercel's default 4.5 MB limit when a function does
//     not set one) and the chainable res.status / res.json / res.send
//     helpers on a real Node ServerResponse, so the MCP handler's
//     streaming transport and the auth flows' writeHead redirects keep
//     working untouched.
//
// No application logic lives here; every request is dispatched to the
// same handler module Vercel invokes. No per-route duration timer is
// imposed: vercel.json's maxDuration values (60 s for api/mcp.js,
// 30 s for api/oauth/* and api/google/*) are platform ceilings, and
// the dossier's rule for this entrypoint is only that it must not
// impose a SHORTER one — a standalone server imposes none.
//
// Release identity (dossier §1.3): src/release.js reads the deployed
// commit from VERCEL_GIT_COMMIT_SHA, which Vercel sets per deployment
// and nothing sets on the rack. The rack build therefore pins it:
// RACK_RELEASE_COMMIT (the promoted commit the build was made from,
// declared in the rack environment) or a release-commit.txt beside
// this file, written by the build recipe. pinReleaseCommit() runs
// before the server accepts traffic; with no valid pin the variable
// stays unset and whoami honestly reports a null commit — the
// acceptance read-back then fails by design rather than passing on a
// synthesized value.
import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';

import { deployedCommit } from './src/release.js';

import account from './api/account.js';
import authGoogleCallback from './api/auth/google/callback.js';
import authGoogleStart from './api/auth/google/start.js';
import authLogout from './api/auth/logout.js';
import authSession from './api/auth/session.js';
import dataDeletion from './api/data-deletion.js';
import developerConnect from './api/developer/connect.js';
import developerTestPass from './api/developer/test-pass.js';
import developerTestPassIssue from './api/developer/test-pass-issue.js';
import googleAuthorize from './api/google/authorize.js';
import googleCallback from './api/google/callback.js';
import frontDoor from './api/index.js';
import mcp, { config as mcpConfig } from './api/mcp.js';
import oauthAuthorize from './api/oauth/authorize.js';
import oauthRegister from './api/oauth/register.js';
import oauthRevoke from './api/oauth/revoke.js';
import oauthToken from './api/oauth/token.js';
import ownerClients from './api/owner/clients.js';
import ownerMigration from './api/owner/migration.js';
import ownerPilotReadiness from './api/owner/pilot-readiness.js';
import ownerTokenReadiness from './api/owner/token-readiness.js';
import privacy from './api/privacy.js';
import rtcGateway from './api/rtc-gateway.js';
import rtcPasses from './api/rtc/passes.js';
import support from './api/support.js';
import wellKnownAS from './api/well-known/oauth-authorization-server.js';
import wellKnownPR from './api/well-known/oauth-protected-resource.js';

const SHA40 = /^[0-9a-f]{40}$/;

// Pins the release identity for this process (see header). Returns
// the pinned commit, the platform-provided one, or null when no valid
// pin exists. Never overwrites a valid platform value, never
// synthesizes a commit.
export function pinReleaseCommit(env = process.env) {
  const existing = deployedCommit(env);
  if (existing) return existing;
  let candidate = typeof env.RACK_RELEASE_COMMIT === 'string' ? env.RACK_RELEASE_COMMIT.trim() : '';
  if (!SHA40.test(candidate)) {
    try {
      candidate = readFileSync(new URL('./release-commit.txt', import.meta.url), 'utf8').trim();
    } catch { candidate = ''; }
  }
  if (!SHA40.test(candidate)) return null;
  env.VERCEL_GIT_COMMIT_SHA = candidate;
  return candidate;
}

const pinnedCommit = pinReleaseCommit();

// Only api/mcp.js exports a bodyParser config today; the other
// functions ride Vercel's defaults, so their routes carry no config.
const route = (handler, config) => Object.freeze({ handler, config });

export const FILE_ROUTES = new Map([
  ['/api/account', route(account)],
  ['/api/auth/google/callback', route(authGoogleCallback)],
  ['/api/auth/google/start', route(authGoogleStart)],
  ['/api/auth/logout', route(authLogout)],
  ['/api/auth/session', route(authSession)],
  ['/api/data-deletion', route(dataDeletion)],
  ['/api/developer/connect', route(developerConnect)],
  ['/api/developer/test-pass', route(developerTestPass)],
  ['/api/developer/test-pass-issue', route(developerTestPassIssue)],
  ['/api/google/authorize', route(googleAuthorize)],
  ['/api/google/callback', route(googleCallback)],
  ['/api/index', route(frontDoor)],
  ['/api', route(frontDoor)],
  ['/api/mcp', route(mcp, mcpConfig)],
  ['/api/oauth/authorize', route(oauthAuthorize)],
  ['/api/oauth/register', route(oauthRegister)],
  ['/api/oauth/revoke', route(oauthRevoke)],
  ['/api/oauth/token', route(oauthToken)],
  ['/api/owner/clients', route(ownerClients)],
  ['/api/owner/migration', route(ownerMigration)],
  ['/api/owner/pilot-readiness', route(ownerPilotReadiness)],
  ['/api/owner/token-readiness', route(ownerTokenReadiness)],
  ['/api/privacy', route(privacy)],
  ['/api/rtc-gateway', route(rtcGateway)],
  ['/api/rtc/passes', route(rtcPasses)],
  ['/api/support', route(support)],
  ['/api/well-known/oauth-authorization-server', route(wellKnownAS)],
  ['/api/well-known/oauth-protected-resource', route(wellKnownPR)],
]);

const REWRITE_ROUTES = new Map([
  ['/.well-known/oauth-authorization-server', route(wellKnownAS)],
  ['/.well-known/oauth-protected-resource', route(wellKnownPR)],
]);

// Resolves a request path to {handler, config, query} — query carries
// the rewrite-injected parameters for the RTC doors — or null (404).
export function resolveRoute(pathname) {
  if (pathname === '/') return { ...route(frontDoor), query: {} };
  const rewritten = REWRITE_ROUTES.get(pathname);
  if (rewritten) return { ...rewritten, query: {} };
  if (pathname === '/api/contract') return { ...route(rtcGateway), query: { door: 'contract' } };
  if (pathname === '/api/openapi.json') return { ...route(rtcGateway), query: { door: 'openapi' } };
  if (pathname === '/api/whoami') return { ...route(rtcGateway), query: { door: 'whoami' } };
  if (pathname === '/api/tools') return { ...route(rtcGateway), query: { door: 'tools' } };
  let match = /^\/api\/tools\/([^/]+)$/.exec(pathname);
  if (match) return { ...route(rtcGateway), query: { tool: decodeURIComponent(match[1]) } };
  match = /^\/api\/results\/([^/]+)$/.exec(pathname);
  if (match) return { ...route(rtcGateway), query: { result: decodeURIComponent(match[1]) } };
  const file = FILE_ROUTES.get(pathname);
  if (file) return { ...file, query: {} };
  return null;
}

const DEFAULT_BODY_LIMIT = 4_572_800; // Vercel's function body limit when a function sets none (4.5 MB)

export function bodyLimitBytes(config) {
  const parser = config?.api?.bodyParser;
  if (parser === false) return 0;
  const declared = typeof parser === 'object' && parser !== null ? parser.sizeLimit : undefined;
  if (declared === undefined) return DEFAULT_BODY_LIMIT;
  if (typeof declared === 'number') return declared;
  const parsed = /^(\d+(?:\.\d+)?)\s*(b|kb|mb)$/i.exec(String(declared).trim());
  if (!parsed) return DEFAULT_BODY_LIMIT;
  const factor = { b: 1, kb: 1024, mb: 1024 * 1024 }[parsed[2].toLowerCase()];
  return Math.floor(Number(parsed[1]) * factor);
}

function queryObject(searchParams) {
  const query = {};
  for (const key of new Set(searchParams.keys())) {
    const values = searchParams.getAll(key);
    query[key] = values.length === 1 ? values[0] : values;
  }
  return query;
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

// Reproduces Vercel's bodyParser: JSON and form bodies arrive as
// objects, anything else as a string, no body as undefined. A JSON
// parse failure is the platform's 400, answered before the handler.
function parseBody(raw, contentType) {
  if (raw.length === 0) return undefined;
  const type = String(contentType || '').split(';')[0].trim().toLowerCase();
  const text = raw.toString('utf8');
  if (type === 'application/json') {
    try {
      return JSON.parse(text);
    } catch {
      const error = new Error('Invalid JSON body');
      error.statusCode = 400;
      throw error;
    }
  }
  if (type === 'application/x-www-form-urlencoded') return queryObject(new URLSearchParams(text));
  return text;
}

function decorateResponse(res) {
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (value) => {
    if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(value));
    return res;
  };
  res.send = (body) => {
    if (body === undefined || body === null) {
      res.end();
      return res;
    }
    if (typeof body === 'object' && !Buffer.isBuffer(body)) return res.json(body);
    if (typeof body === 'string' && !res.getHeader('Content-Type')) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
    }
    res.end(body);
    return res;
  };
  return res;
}

function platformError(res, statusCode, error) {
  if (res.headersSent) return;
  res.setHeader('Cache-Control', 'no-store');
  res.status(statusCode).json({ error, error_description: statusCode === 413
    ? 'The request body exceeds this function\'s configured limit.'
    : 'The request body could not be parsed as JSON.' });
}

export function createRackServer() {
  return createServer(async (req, res) => {
    decorateResponse(res);
    try {
      const url = new URL(req.url, 'http://rack.internal');
      const resolved = resolveRoute(url.pathname);
      if (!resolved) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: 'not_found' });
      }
      req.query = { ...queryObject(url.searchParams), ...resolved.query };
      const limit = bodyLimitBytes(resolved.config);
      if (limit > 0 && req.method !== 'GET' && req.method !== 'HEAD') {
        const raw = await readBody(req, limit);
        req.body = parseBody(raw, req.headers['content-type']);
      }
      return await resolved.handler(req, res);
    } catch (error) {
      if (error?.statusCode === 400 || error?.statusCode === 413) {
        return platformError(res, error.statusCode, error.statusCode === 413 ? 'payload_too_large' : 'invalid_json');
      }
      if (!res.headersSent) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(500).json({ error: 'internal_error' });
      }
      res.end();
    }
  });
}

if (process.argv[1]?.endsWith('rack-server.mjs')) {
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || '127.0.0.1';
  if (!pinnedCommit) {
    console.warn('rack-server: no release pin found (RACK_RELEASE_COMMIT or release-commit.txt); whoami will report a null commit until the build pins one.');
  }
  createRackServer().listen(port, host, () => {
    console.log(`Workspace Unleashed rack entrypoint listening on ${host}:${port} (release ${pinnedCommit || 'unpinned'})`);
  });
}
