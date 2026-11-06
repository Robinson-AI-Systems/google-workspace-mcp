import crypto from 'node:crypto';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Verifies an OAuth 2.1 PKCE code_verifier against the stored code_challenge. */
export function verifyPkce(codeVerifier, codeChallenge, method) {
  // OAuth 2.1 requires PKCE with S256 for all newly issued native MCP codes.
  // A missing challenge or the legacy "plain" method is never an opt-out.
  if (method !== 'S256' ||
      typeof codeChallenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(codeChallenge) ||
      typeof codeVerifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(codeVerifier)) return false;
  const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(codeChallenge));
}

export function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseRawBody(raw, contentType) {
  if (!raw) return {};
  if (contentType.includes('application/json')) return JSON.parse(raw);
  if (contentType.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try { return JSON.parse(raw); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
}

export async function parseBody(req) {
  // A hosting entrypoint may already have consumed and parsed the body
  // before dispatch (the rack server does, and sets req.body; several
  // handlers have long preferred req.body for the same reason). A
  // consumed stream never emits 'end' again, so re-reading it hangs
  // forever — prefer the body that is already there: an object as-is, a
  // raw string parsed exactly as the stream path would parse it.
  if (req.body !== undefined) {
    if (typeof req.body === 'string') return parseRawBody(req.body, req.headers['content-type'] || '');
    if (req.body && typeof req.body === 'object') return req.body;
    return {};
  }
  const raw = await readBody(req);
  return parseRawBody(raw, req.headers['content-type'] || '');
}
