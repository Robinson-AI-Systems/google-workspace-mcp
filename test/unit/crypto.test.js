import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';
import { encryptJson, decryptJson, loadKey, resetWarning } from '../../src/crypto.js';

const key = () => crypto.randomBytes(32);
const sample = { access_token: 'fake-access', refresh_token: 'fake-refresh', expiry_date: 1790000000000, scope: 'a b' };

describe('encryptJson / decryptJson', () => {
  it('round-trips a tokens object exactly', () => {
    const k = key();
    expect(decryptJson(encryptJson(sample, k), k)).toEqual(sample);
  });
  it('uses the v1:<iv>:<tag>:<ciphertext> shape and never contains the plaintext', () => {
    const stored = encryptJson(sample, key());
    expect(stored.split(':')).toHaveLength(4);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toContain('fake-refresh');
    expect(Buffer.from(stored.split(':')[3], 'base64').toString('utf8')).not.toContain('fake-refresh');
  });
  it('uses a fresh random IV every time', () => {
    const k = key();
    expect(encryptJson(sample, k)).not.toBe(encryptJson(sample, k));
  });
  it('throws when any single byte of the IV, tag or ciphertext is flipped', () => {
    const k = key();
    const parts = encryptJson(sample, k).split(':');
    for (const index of [1, 2, 3]) {
      const bytes = Buffer.from(parts[index], 'base64');
      bytes[0] ^= 1;
      const tampered = parts.map((p, i) => (i === index ? bytes.toString('base64') : p)).join(':');
      expect(() => decryptJson(tampered, k), `part ${index}`).toThrow();
    }
  });
  it('throws with the wrong key', () => {
    expect(() => decryptJson(encryptJson(sample, key()), key())).toThrow();
  });
  it('throws on values that are not in the expected format', () => {
    const k = key();
    for (const bad of ['', 'plain text', 'v2:a:b:c', 'v1:a:b', JSON.stringify(sample)]) expect(() => decryptJson(bad, k), bad).toThrow();
  });
});

describe('loadKey', () => {
  let warn;
  beforeEach(() => { resetWarning(); warn = vi.spyOn(console, 'warn').mockImplementation(() => {}); });
  afterEach(() => warn.mockRestore());

  it('accepts exactly 32 bytes of base64', () => {
    const raw = crypto.randomBytes(32);
    expect(loadKey({ TOKEN_ENCRYPTION_KEY: raw.toString('base64') }).equals(raw)).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
  it('returns null and warns exactly once when missing, without ever throwing', () => {
    expect(loadKey({})).toBeNull();
    expect(loadKey({})).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
  it('returns null (not a crash) for a key of the wrong size, and does not print it', () => {
    const short = crypto.randomBytes(16).toString('base64');
    expect(loadKey({ TOKEN_ENCRYPTION_KEY: short })).toBeNull();
    expect(JSON.stringify(warn.mock.calls)).not.toContain(short);
  });
});
