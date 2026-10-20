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

export async function parseBody(req) {
  const raw = await readBody(req);
  const contentType = req.headers['content-type'] || '';
  if (!raw) return {};
  if (contentType.includes('application/json')) return JSON.parse(raw);
  if (contentType.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(raw));
  try { return JSON.parse(raw); } catch { return Object.fromEntries(new URLSearchParams(raw)); }
}
