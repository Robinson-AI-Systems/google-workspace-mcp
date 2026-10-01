import { describe, it, expect } from 'vitest';
import { errorResult } from '../../src/tools/util.js';
import { explainError } from '../../src/tools/errors.js';
import { googleError } from '../helpers/fake-google.js';

const text = (err) => errorResult(err).content[0].text;
const withHeaders = (err, headers) => { err.response.headers = headers; return err; };

describe('plain-English errors', () => {
  const cases = [
    ['delegation needed', googleError(403, 'forbidden', 'Access restricted to service accounts that have delegation enabled'), /domain-wide delegation/i, /DEPLOY\.md Part 5/],
    ['robot rejected (unauthorized_client)', Object.assign(new Error('unauthorized_client'), { response: { status: 400, data: { error: 'unauthorized_client', error_description: 'Client is unauthorized to retrieve access tokens using this method' } } }), /rejected the server's robot identity/i, /Domain-wide delegation/],
    ['sign-in revoked (invalid_grant)', Object.assign(new Error('invalid_grant'), { response: { status: 400, data: { error: 'invalid_grant', error_description: 'Token has been expired or revoked.' } } }), /no longer accepts the saved sign-in/i, /api\/google\/authorize/],
    ['wrong user (invalid_grant)', Object.assign(new Error('invalid_grant'), { response: { status: 400, data: { error: 'invalid_grant', error_description: 'Invalid email or User ID' } } }), /act as that user/i, /real, active user/],
    ['wrong domain operation', googleError(403, 'forbidden', 'Unauthorized operation for the given domain'), /would not run this action for this domain/i, /customer ID/],
    ['missing scope', googleError(403, 'insufficientPermissions', 'Request had insufficient authentication scopes. https://www.googleapis.com/auth/admin.directory.user'), /not given permission/i, /api\/google\/authorize/],
    ['rate limit', googleError(429, 'rateLimitExceeded', 'Rate Limit Exceeded'), /limiting how fast/i, /about a minute/],
    ['not found', googleError(404, 'notFound', 'Requested entity was not found.'), /could not find that item/i, /workspace_whoami/],
    ['bad value', googleError(400, 'invalid', 'Invalid value for: Invalid Input: orgUnitPath'), /did not accept one of the values/i, /orgUnitPath/],
    ['signed out', googleError(401, 'authError', 'Invalid Credentials'), /no longer accepts the saved sign-in/i, /api\/google\/authorize/],
    ['not an admin', googleError(403, 'forbidden', 'Not Authorized to access this resource/api'), /not allowed to do that/i, /super admin/]
  ];
  for (const [name, err, what, todo] of cases) {
    it(`explains: ${name}, and keeps Google's own words at the end`, () => {
      const out = text(err);
      expect(out).toMatch(what);
      expect(out).toMatch(todo);
      expect(out).toMatch(/Technical detail: Error: /);
      expect(out.indexOf('What happened')).toBeLessThan(out.indexOf('Technical detail'));
      expect(out).toContain(err.response.data.error?.message || err.response.data.error_description || err.message);
    });
  }

  it('says how long to wait when Google says so, and tells a daily quota apart', () => {
    expect(text(withHeaders(googleError(429, 'rateLimitExceeded', 'Rate Limit Exceeded'), { 'retry-after': '37' }))).toMatch(/Wait 37 seconds/);
    expect(text(googleError(403, 'dailyLimitExceeded', 'Daily Limit Exceeded'))).toMatch(/Try again tomorrow/);
  });

  it('names the exact scope when Google puts it in the message', () => {
    expect(text(googleError(403, 'insufficientPermissions', 'needs https://www.googleapis.com/auth/gmail.settings.basic'))).toContain('https://www.googleapis.com/auth/gmail.settings.basic');
  });

  it('names the bad field from Google\'s location when it gives one', () => {
    const err = googleError(400, 'invalid', 'Invalid value');
    err.response.data.error.errors[0].location = 'timeZone';
    expect(text(err)).toMatch(/"timeZone"/);
  });

  it('shows an error it does not recognise exactly as before, still flagged as an error', () => {
    const result = errorResult(new Error('something odd'));
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Error: something odd');
    expect(explainError(new Error('something odd'))).toBeNull();
  });

  it('does not blame a missing item for a network failure or a message that merely says "not found"', () => {
    const dns = Object.assign(new Error('getaddrinfo ENOTFOUND www.googleapis.com'), { code: 'ENOTFOUND' });
    expect(text(dns)).toBe('Error: getaddrinfo ENOTFOUND www.googleapis.com');
    expect(text(googleError(403, 'forbidden', 'File not found: abc'))).toMatch(/not allowed to do that/i);
    expect(text(googleError(400, 'invalid', 'Invalid value: label not found'))).not.toMatch(/could not find that item/i);
  });

  it('says a full Drive is full (waiting will not help), not a rate limit', () => {
    const out = text(googleError(403, 'storageQuotaExceeded', 'The user\'s Drive storage quota has been exceeded.'));
    expect(out).toMatch(/storage for this account is full/i);
    expect(out).toMatch(/Waiting will not help/);
    expect(out).not.toMatch(/Wait about a minute/);
  });

  it('does not blame the email address for a bad robot key or a clock problem', () => {
    const jwt = (msg) => Object.assign(new Error('invalid_grant'), { response: { status: 400, data: { error: 'invalid_grant', error_description: msg } } });
    for (const msg of ['Invalid JWT Signature.', 'Invalid JWT: Token must be a short-lived token (60 minutes) and in a reasonable timeframe.']) {
      const out = text(jwt(msg));
      expect(out).toMatch(/robot key may be wrong/i);
      expect(out).not.toMatch(/email address is wrong/i);
    }
    expect(text(jwt('Account has been deleted'))).toMatch(/deleted or disabled/);
  });

  it('never throws while formatting, even for details that cannot be turned into text', () => {
    const circular = {}; circular.self = circular;
    const err = googleError(400, 'invalid', 'bad');
    err.response.data.error.errors = [circular];
    expect(() => text(err)).not.toThrow();
    expect(text(err)).toContain('Technical detail');
    expect(() => text(null)).not.toThrow();
    expect(() => text(undefined)).not.toThrow();
  });

  it('keeps Google\'s details list in the technical detail', () => {
    expect(text(googleError(403, 'forbidden', 'Not Authorized to access this resource/api'))).toContain('Details: ');
  });
});
