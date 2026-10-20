// The real login page handler (api/oauth/authorize.js), driven the way Vercel
// drives it, with the fake database behind it.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Readable } from 'node:stream';
import crypto from 'node:crypto';
import { createFakeDb } from '../helpers/fake-db.js';

const MINUTE = 60 * 1000;
let now;
let fake;
const holder = vi.hoisted(() => ({ db: null }));
// Every function the real src/db.js exports is routed to the fake database for this test.
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
vi.mock('../../src/auth/google-auth-hosted.js', () => ({ ensureMigrated: async () => null }));

const { default: handler } = await import('../../api/oauth/authorize.js');

const PASSPHRASE = 'correct horse battery staple';
const REDIRECT = 'https://claude.example.test/callback';
const VERIFIER='A'.repeat(43);
const CHALLENGE=crypto.createHash('sha256').update(VERIFIER).digest('base64url');
const AUTH={clientId:'claude',redirectUri:REDIRECT,verifier:VERIFIER};
const PKCE={code_challenge:CHALLENGE,code_challenge_method:'S256'};

function fakeRes() {
  const res = { statusCode: 200, headers: {}, body: '' };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  res.status = (c) => { res.statusCode = c; return res; };
  res.send = (b) => { res.body = String(b); return res; };
  res.writeHead = (c, h = {}) => { res.statusCode = c; Object.assign(res.headers, h); };
  res.end = () => res;
  return res;
}

function post({ passphrase, account = 'rentals@example.test', ip = '1.1.1.1', profile='read_only',areas,cost_consent,ack_unknown_charges }) {
  const form = new URLSearchParams({ client_id: 'claude', redirect_uri: REDIRECT, state: 'st', ...PKCE, profile, passphrase, google_account: account });
  for(const [name,value] of Object.entries({areas,cost_consent,ack_unknown_charges}))
    if(value!==undefined)form.set(name,value);
  const req = Readable.from([form.toString()]);
  req.method = 'POST';
  req.headers = { 'content-type': 'application/x-www-form-urlencoded', 'x-vercel-forwarded-for': ip };
  return req;
}

async function login(opts) {
  const res = fakeRes();
  await handler(post(opts), res);
  return res;
}

beforeEach(async () => {
  now = Date.parse('2026-10-01T12:00:00Z');
  fake = createFakeDb({ clock: () => now });
  holder.db = fake;
  process.env.ADMIN_PASSPHRASE = PASSPHRASE;
  await fake.createOAuthClient({ clientId: 'claude', clientSecret: 's', redirectUris: [REDIRECT] });
  await fake.saveGoogleTokensFor('ops@example.test', { access_token: 'a' }, { label: 'AI Systems' });
  await fake.saveGoogleTokensFor('rentals@example.test', { access_token: 'b' }, { label: 'Appliance Rentals' });
});

describe('passphrase page lockout', () => {
  it('prefills requested access and preserves the owner choice after errors',async()=>{
    for(const profile of ['full','everyday',undefined]){
      const res=fakeRes();await handler({method:'GET',headers:{},query:{client_id:'claude',redirect_uri:REDIRECT,...PKCE,profile}},res);
      expect(res.body).toContain(`<option value="${profile||'read_only'}" selected>`);
      expect(res.body).not.toContain('type="hidden" name="profile"');
      expect(res.body).not.toContain('ops@example.test');
      expect(res.body).not.toMatch(/<option[^>]*>AI Systems<\/option>/);
      expect(res.body).not.toContain('Appliance Rentals');
    }
    const failed=await login({passphrase:'wrong',profile:'full'});expect(failed.body).toContain('<option value="full" selected>');
    const res=await login({passphrase:PASSPHRASE,profile:'everyday'});const code=new URL(res.headers.Location).searchParams.get('code');
    expect(code).toHaveLength(32);expect((await fake.consumeAuthCode(code,AUTH)).profile).toBe('everyday');
  });
  it('signs in with the right passphrase and binds the connection to the chosen account', async () => {
    const res = await login({ passphrase: PASSPHRASE });
    expect(res.statusCode).toBe(302);
    const target = new URL(res.headers.Location);
    expect(`${target.origin}${target.pathname}`).toBe(REDIRECT);
    expect(target.searchParams.get('state')).toBe('st');
    const code = await fake.consumeAuthCode(target.searchParams.get('code'),AUTH);
    expect(code.google_account).toBe('rentals@example.test');
  });

  it('persists an explicitly selected live owner policy and unknown-billing cost consent in a one-time code',async()=>{
    const page=fakeRes();await handler({method:'GET',query:{client_id:'claude',redirect_uri:REDIRECT,...PKCE},headers:{}},page);
    expect(page.body).toContain('name="cost_consent"');
    expect(page.body).toContain('name="ack_unknown_charges"');
    const signed=await login({passphrase:PASSPHRASE,profile:'full',areas:'admin,workspace',
      cost_consent:'standing_assign',ack_unknown_charges:'yes'});
    expect(signed.statusCode).toBe(302);
    const code=new URL(signed.headers.Location).searchParams.get('code');
    expect(await fake.consumeAuthCode(code,AUTH)).toMatchObject({google_account:'rentals@example.test',
      profile:'full',areas:['admin','workspace'],mode:'live',cost_policy:{
        mode:'standing',account:'rentals@example.test',operations:['assign_license'],
        allowUnknownPrice:true,maxChargeUsd:null}});
  });
  it('rejects unapproved standing licensing billing without issuing an OAuth code',async()=>{
    for(const selection of [
      {profile:'read_only',cost_consent:'standing_assign',ack_unknown_charges:'yes'},
      {profile:'full',areas:'mail',cost_consent:'standing_assign',ack_unknown_charges:'yes'},
      {profile:'full',cost_consent:'standing_assign'},
      {profile:'full',cost_consent:'nonsense'}
    ]){
      const res=await login({passphrase:PASSPHRASE,...selection});
      expect(res.statusCode).toBe(400);
      expect(res.headers.Location).toBeUndefined();
    }
    expect(fake.__state.codes.size).toBe(0);
  });
  it('answers a wrong passphrase with 401, keeps the chosen account, and says how many tries are left', async () => {
    const res = await login({ passphrase: 'nope', account: 'rentals@example.test' });
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('Incorrect passphrase');
    expect(res.body).toContain('4 tries left');
    expect(res.body).toContain('name="google_account"');
    expect(res.body).toContain('value="rentals@example.test"');
    expect(res.body).not.toContain('ops@example.test');
    expect(res.body).not.toMatch(/<option[^>]*>AI Systems<\/option>/);
    expect(res.headers.Location).toBeUndefined();
  });

  it('locks after five wrong passphrases: the sixth gets 429 and a wait time, even with the correct passphrase, and no login code is issued', async () => {
    for (let i = 0; i < 5; i++) expect((await login({ passphrase: `wrong${i}` })).statusCode).toBe(401);
    const res = await login({ passphrase: PASSPHRASE });
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('900');
    expect(res.body).toContain('Wait 15 minutes');
    expect(res.headers.Location).toBeUndefined();
    expect(fake.__state.codes.size).toBe(0);
  });

  it('warns on the fifth wrong try that the next one starts the lockout', async () => {
    let res;
    for (let i = 0; i < 5; i++) res = await login({ passphrase: `wrong${i}` });
    expect(res.statusCode).toBe(401);
    expect(res.body).toContain('next wrong try starts a 15-minute lockout');
  });

  it('lets the owner back in once the 15 minutes have passed', async () => {
    for (let i = 0; i < 5; i++) await login({ passphrase: `wrong${i}` });
    now += 14 * MINUTE;
    expect((await login({ passphrase: PASSPHRASE })).statusCode).toBe(429); // this refused try restarts the clock
    now += 16 * MINUTE;
    const res = await login({ passphrase: PASSPHRASE });
    expect(res.statusCode).toBe(302);
  });

  it('does not lock a different address', async () => {
    for (let i = 0; i < 6; i++) await login({ passphrase: 'wrong', ip: '6.6.6.6' });
    expect((await login({ passphrase: PASSPHRASE, ip: '6.6.6.6' })).statusCode).toBe(429);
    expect((await login({ passphrase: PASSPHRASE, ip: '7.7.7.7' })).statusCode).toBe(302);
  });

  it('only counts passphrase tries: opening the page does not use them up', async () => {
    for (let i = 0; i < 20; i++) {
      const req = Readable.from(['']);
      req.method = 'GET';
      req.headers = { 'x-vercel-forwarded-for': '1.1.1.1' };
      req.query = { client_id: 'claude', redirect_uri: REDIRECT };
      const res = fakeRes();
      await handler(req, res);
      expect(res.statusCode).toBe(200);
    }
    expect((await login({ passphrase: PASSPHRASE })).statusCode).toBe(302);
  });

  it('fails closed: if the attempt log cannot be written, nobody is let in', async () => {
    fake.recordLoginAttempt = async () => { throw new Error('database unavailable'); };
    const res = fakeRes();
    await expect(handler(post({ passphrase: PASSPHRASE }), res)).rejects.toThrow('database unavailable');
    expect(res.headers.Location).toBeUndefined();
    expect(fake.__state.codes.size).toBe(0);
  });

  it('refuses to run at all when no passphrase is configured', async () => {
    delete process.env.ADMIN_PASSPHRASE;
    const res = await login({ passphrase: '' });
    expect(res.statusCode).toBe(500);
    expect(fake.__state.attempts).toHaveLength(0);
  });

  it('still rejects an account that is not connected, even with the right passphrase', async () => {
    const res = await login({ passphrase: PASSPHRASE, account: 'stranger@example.test' });
    expect(res.statusCode).toBe(400);
    expect(fake.__state.codes.size).toBe(0);
  });
});
