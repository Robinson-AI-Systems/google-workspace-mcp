// Protects the passphrase page (api/oauth/authorize.js) from guessing.
//
// In plain terms: every attempt to sign in is written down against the
// caller's IP address. After 5 wrong passphrases from one address inside 15
// minutes, that address is refused outright, and while it is refused the
// passphrase is not even checked (so a lucky guess cannot get through). The
// refusal ends on its own once 15 minutes pass with no new failures.
//
// The attempt is written down BEFORE the passphrase is compared, then counted
// including itself. That ordering is deliberate: if it were count-then-write,
// someone firing many requests at once could all slip past the count before
// any of them was recorded.
//
// Locked-out tries are recorded too, so someone who keeps hammering stays
// locked out; the owner just waits the 15 minutes without retrying.
import crypto from 'node:crypto';
import { isIP } from 'node:net';

export const MAX_FAILED_LOGINS = 5;
export const LOCKOUT_WINDOW_MINUTES = 15;

/**
 * Best available caller address. On Vercel the platform sets
 * x-vercel-forwarded-for / x-real-ip itself and does not trust a value the
 * caller supplied, so those come first. 'unknown' (one shared bucket) is the
 * fallback so a missing header can never mean "no limit".
 */
export function clientIp(req) {
  const h = req?.headers || {};
  const pick = (v) => String(Array.isArray(v) ? v[0] : v || '').split(',')[0].trim();
  const raw = pick(h['x-vercel-forwarded-for']) || pick(h['x-real-ip']) || pick(h['x-forwarded-for']) || req?.socket?.remoteAddress || '';
  return lockoutKey(raw);
}

/**
 * The bucket an address is counted in. IPv4 is used as-is (IPv4-mapped IPv6
 * like ::ffff:1.2.3.4 becomes plain IPv4). An IPv6 address is reduced to its
 * /64 block, because one home or mobile connection controls the whole block
 * and could otherwise pick a fresh address for every 5 guesses.
 */
export function lockoutKey(raw) {
  let ip = String(raw || '').trim().toLowerCase();
  const withPort = ip.match(/^\[([^\]]+)\](?::\d+)?$/); // [addr] or [addr]:port
  if (withPort) ip = withPort[1];
  ip = ip.split('%')[0]; // zone id
  if (!ip) return 'unknown';
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6) return ip; // not an address we understand: count it as given
  const groups = expandIpv6(ip);
  // IPv4-mapped (::ffff:a.b.c.d, in either spelling) is really an IPv4 client.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    return `${groups[6] >> 8}.${groups[6] & 255}.${groups[7] >> 8}.${groups[7] & 255}`;
  }
  return `${groups.slice(0, 4).map((g) => g.toString(16)).join(':')}::/64`;
}

/** Eight 16-bit numbers for a valid IPv6 string, including :: shorthand and a trailing dotted IPv4. */
function expandIpv6(ip) {
  let text = ip;
  const v4 = text.match(/^(.*:)(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const [, pre, a, b, c, d] = v4;
    text = `${pre}${((+a << 8) | +b).toString(16)}:${((+c << 8) | +d).toString(16)}`;
  }
  const [head, tail] = text.includes('::') ? text.split('::') : [text, null];
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const fill = tail === null ? [] : Array(8 - left.length - right.length).fill('0');
  return [...left, ...fill, ...right].map((g) => parseInt(g, 16));
}

/**
 * Compare in constant time. Both sides are hashed first so the two buffers
 * are always the same length (timingSafeEqual refuses unequal lengths, and
 * checking length first would itself leak it).
 */
export function passphraseMatches(supplied, expected) {
  const digest = (v) => crypto.createHash('sha256').update(String(v ?? '')).digest();
  return crypto.timingSafeEqual(digest(supplied), digest(expected));
}

/**
 * Decide one sign-in attempt.
 * `store` needs: recordLoginAttempt(ip) -> id, countRecentFailedLogins(ip, minutes) -> number,
 * markLoginAttemptSucceeded(id).
 * Returns { status: 'locked' } | { status: 'wrong', attemptsLeft } | { status: 'ok' }.
 */
export async function evaluateLogin({ ip, supplied, expected, store }) {
  const attemptId = await store.recordLoginAttempt(ip);
  const failures = await store.countRecentFailedLogins(ip, LOCKOUT_WINDOW_MINUTES); // includes this attempt
  if (failures > MAX_FAILED_LOGINS) return { status: 'locked' };
  if (!passphraseMatches(supplied, expected)) {
    return { status: 'wrong', attemptsLeft: Math.max(0, MAX_FAILED_LOGINS - failures) };
  }
  await store.markLoginAttemptSucceeded(attemptId);
  return { status: 'ok' };
}
