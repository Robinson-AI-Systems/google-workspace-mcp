import crypto from 'node:crypto';

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

/** Verifies an OAuth 2.1 PKCE code_verifier against the stored code_challenge. */
export function verifyPkce(codeVerifier, codeChallenge, method) {
  if (!codeChallenge) return true; // PKCE not used by this client (allowed for confidential clients)
  if (!codeVerifier) return false;
  if ((method || 'S256') === 'S256') {
    const computed = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    return computed === codeChallenge;
  }
  // 'plain' method
  return codeVerifier === codeChallenge;
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
