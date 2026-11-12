// Encrypts the Google sign-in tokens before they are stored in the database,
// so a leaked database copy does not hand over access to your Workspace.
//
// Format of a stored value:  v1:<iv>:<tag>:<ciphertext>   (each part base64)
// Algorithm: AES-256-GCM with a fresh random IV for every value. GCM also
// authenticates, so a value that was altered (even by one byte) or opened with
// the wrong key fails to decrypt instead of returning garbage.
//
// The key is the TOKEN_ENCRYPTION_KEY setting: 32 random bytes, base64.
// Make one with:  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
// During a key change, TOKEN_ENCRYPTION_KEY_PREVIOUS (comma-separated base64
// 32-byte keys, at most two) is also accepted for reading only; see loadPreviousKeys.
import crypto from 'node:crypto';

const PREFIX = 'v1';
let warned = false;

/** The 32-byte key from the environment, or null when it is missing or not valid. Warns once per cold start. */
export function loadKey(env = process.env) {
  const raw = env.TOKEN_ENCRYPTION_KEY;
  if (!raw) { warnOnce('TOKEN_ENCRYPTION_KEY is not set: Google tokens are stored without encryption.'); return null; }
  const key = Buffer.from(String(raw).trim(), 'base64');
  if (key.length !== 32) { warnOnce('TOKEN_ENCRYPTION_KEY is set but is not 32 bytes of base64: Google tokens are stored without encryption.'); return null; }
  return key;
}

/** Older keys still accepted for READING during a key change: TOKEN_ENCRYPTION_KEY_PREVIOUS
 * holds comma-separated base64 32-byte keys, at most two — the fleet dual-key contract, the
 * same one the GitHub and Vercel servers use. New values are always sealed with the current
 * key (encryptJson), so a previous key can be dropped once nothing sealed with it remains.
 * A malformed previous-key entry is ignored here and never weakens the current key. */
export function loadPreviousKeys(env = process.env) {
  const raw = env.TOKEN_ENCRYPTION_KEY_PREVIOUS;
  if (typeof raw !== 'string' || !raw.trim()) return [];
  const keys = [];
  for (const part of raw.split(',').map((x) => x.trim()).filter(Boolean).slice(0, 2)) {
    const key = Buffer.from(part, 'base64');
    if (key.length === 32) keys.push(key);
  }
  return keys;
}

function warnOnce(message) {
  if (warned) return;
  warned = true;
  console.warn(`[crypto] ${message}`);
}

/** For tests: forget that the warning was already shown. */
export function resetWarning() { warned = false; }

export function encryptJson(value, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

function decryptWithKey(stored, key) {
  const parts = String(stored).split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error('Stored value is not in the expected encrypted format.');
  const [, iv, tag, ciphertext] = parts.map((p, i) => (i === 0 ? p : Buffer.from(p, 'base64')));
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Stored value is not in the expected encrypted format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const text = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(text);
}

/** Throws if the value is malformed, was altered, or was made with a different key.
 * During a key change, the previous key(s) from TOKEN_ENCRYPTION_KEY_PREVIOUS are tried
 * after the given (current) key, so tokens sealed under the old key stay readable until
 * they are re-sealed under the new one. With no previous key configured this behaves
 * exactly like the original single-key decrypt. */
export function decryptJson(stored, key, env = process.env) {
  try {
    return decryptWithKey(stored, key);
  } catch (primaryError) {
    for (const previous of loadPreviousKeys(env)) {
      try { return decryptWithKey(stored, previous); } catch { /* try the next previous key */ }
    }
    throw primaryError;
  }
}
