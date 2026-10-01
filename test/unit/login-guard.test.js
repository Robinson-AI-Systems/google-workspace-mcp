import { describe, it, expect } from 'vitest';
import { createFakeDb } from '../helpers/fake-db.js';
import { clientIp, passphraseMatches, evaluateLogin, MAX_FAILED_LOGINS, LOCKOUT_WINDOW_MINUTES } from '../../src/oauth/login-guard.js';

const MINUTE = 60 * 1000;
const setup = () => {
  let now = Date.parse('2026-10-01T12:00:00Z');
  const db = createFakeDb({ clock: () => now });
  return { db, advance: (ms) => { now += ms; } };
};
const attempt = (db, supplied, ip = '1.1.1.1') => evaluateLogin({ ip, supplied, expected: 'right-passphrase', store: db });

describe('passphraseMatches', () => {
  it('accepts only the exact passphrase', () => {
    expect(passphraseMatches('right-passphrase', 'right-passphrase')).toBe(true);
    expect(passphraseMatches('right-passphras', 'right-passphrase')).toBe(false);
    expect(passphraseMatches('right-passphrase ', 'right-passphrase')).toBe(false);
    expect(passphraseMatches('RIGHT-PASSPHRASE', 'right-passphrase')).toBe(false);
  });

  it('handles any length or missing input without throwing (timingSafeEqual alone throws on unequal lengths)', () => {
    expect(passphraseMatches('', 'right-passphrase')).toBe(false);
    expect(passphraseMatches(undefined, 'right-passphrase')).toBe(false);
    expect(passphraseMatches(null, 'right-passphrase')).toBe(false);
    expect(passphraseMatches('x'.repeat(10000), 'right-passphrase')).toBe(false);
  });
});

describe('clientIp', () => {
  it('prefers the address the hosting platform sets itself', () => {
    expect(clientIp({ headers: { 'x-vercel-forwarded-for': '5.5.5.5', 'x-forwarded-for': '6.6.6.6, 7.7.7.7' } })).toBe('5.5.5.5');
    expect(clientIp({ headers: { 'x-real-ip': '4.4.4.4', 'x-forwarded-for': '6.6.6.6' } })).toBe('4.4.4.4');
    expect(clientIp({ headers: { 'x-forwarded-for': '6.6.6.6, 7.7.7.7' } })).toBe('6.6.6.6');
  });
  it('falls back to the socket, and then to one shared bucket rather than no limit', () => {
    expect(clientIp({ headers: {}, socket: { remoteAddress: '8.8.8.8' } })).toBe('8.8.8.8');
    expect(clientIp({ headers: {} })).toBe('unknown');
    expect(clientIp(undefined)).toBe('unknown');
  });
});

describe('evaluateLogin', () => {
  it('lets the right passphrase in', async () => {
    const { db } = setup();
    expect(await attempt(db, 'right-passphrase')).toEqual({ status: 'ok' });
  });

  it('allows five wrong tries, counting down, then locks on the sixth', async () => {
    const { db } = setup();
    const results = [];
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) results.push(await attempt(db, 'wrong'));
    expect(results.map((r) => r.status)).toEqual(Array(5).fill('wrong'));
    expect(results.map((r) => r.attemptsLeft)).toEqual([4, 3, 2, 1, 0]);
    expect(await attempt(db, 'wrong')).toEqual({ status: 'locked' });
  });

  it('refuses the CORRECT passphrase while locked, so a lucky guess after lockout gets nothing', async () => {
    const { db } = setup();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await attempt(db, 'wrong');
    expect(await attempt(db, 'right-passphrase')).toEqual({ status: 'locked' });
  });

  it('does not check the passphrase at all once locked', async () => {
    const { db } = setup();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await attempt(db, 'wrong');
    const throwing = { get toString() { throw new Error('passphrase was inspected while locked'); } };
    expect(await attempt(db, throwing)).toEqual({ status: 'locked' });
  });

  it('a success before the limit does not lock, and wrong tries before it still count', async () => {
    const { db } = setup();
    for (let i = 0; i < 4; i++) await attempt(db, 'wrong');
    expect(await attempt(db, 'right-passphrase')).toEqual({ status: 'ok' });
  });

  it('locks one address without affecting another', async () => {
    const { db } = setup();
    for (let i = 0; i < MAX_FAILED_LOGINS + 1; i++) await attempt(db, 'wrong', '1.1.1.1');
    expect(await attempt(db, 'right-passphrase', '1.1.1.1')).toEqual({ status: 'locked' });
    expect(await attempt(db, 'right-passphrase', '2.2.2.2')).toEqual({ status: 'ok' });
  });

  it('unlocks on its own once 15 minutes pass with no new failures', async () => {
    const { db, advance } = setup();
    for (let i = 0; i < MAX_FAILED_LOGINS; i++) await attempt(db, 'wrong');
    advance((LOCKOUT_WINDOW_MINUTES - 1) * MINUTE);
    expect(await attempt(db, 'right-passphrase')).toEqual({ status: 'locked' });
    // that locked try is itself recorded, so the clock restarts from it
    advance(LOCKOUT_WINDOW_MINUTES * MINUTE + 1000);
    expect(await attempt(db, 'right-passphrase')).toEqual({ status: 'ok' });
  });

  it('forgets old failures: five spread across more than the window never lock', async () => {
    const { db, advance } = setup();
    for (let i = 0; i < 8; i++) {
      expect((await attempt(db, 'wrong')).status).toBe('wrong');
      advance(4 * MINUTE); // 8 failures over 28 minutes, never more than 4 inside any 15
    }
  });

  it('cannot be beaten by firing many tries at once: no more than five ever get their passphrase checked', async () => {
    const { db } = setup();
    const burst = await Promise.all(Array.from({ length: 50 }, () => attempt(db, 'wrong')));
    expect(burst.filter((r) => r.status !== 'locked').length).toBeLessThanOrEqual(MAX_FAILED_LOGINS);
    expect(burst.filter((r) => r.status === 'locked').length).toBeGreaterThanOrEqual(50 - MAX_FAILED_LOGINS);
  });
});
