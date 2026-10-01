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

/** Throws if the value is malformed, was altered, or was made with a different key. */
export function decryptJson(stored, key) {
  const parts = String(stored).split(':');
  if (parts.length !== 4 || parts[0] !== PREFIX) throw new Error('Stored value is not in the expected encrypted format.');
  const [, iv, tag, ciphertext] = parts.map((p, i) => (i === 0 ? p : Buffer.from(p, 'base64')));
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Stored value is not in the expected encrypted format.');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const text = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  return JSON.parse(text);
}
