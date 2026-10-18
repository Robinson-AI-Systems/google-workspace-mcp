import crypto from 'node:crypto';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mock=vi.hoisted(()=>({url:null,token:null,claims:null,clientId:null,called:null}));
vi.mock('googleapis',()=>({google:{auth:{OAuth2:class{
 constructor(id,secret,redirect){mock.clientId={id,secret,redirect};}
 generateAuthUrl(options){mock.url=options;return 'https://accounts.google.com/o/oauth2?state='+encodeURIComponent(options.state);}
 async getToken(options){mock.called=options;return {tokens:mock.token};}
 async verifyIdToken(options){mock.verified=options;return {getPayload:()=>mock.claims};}
}}}}));
import {publicGoogleClient,providerUrl,verifyGoogleCode} from '../../src/principals/google.js';
import {digest,publicMode,admitted,legacyPilotLoginAllowed,readCookie,cookie} from '../../src/principals/security.js';
import {sealV2,openV2} from '../../src/principals/crypto.js';
let prior;
beforeEach(()=>{
 prior={...process.env};
 process.env.PUBLIC_BASE_URL='https://mcp.example.test';
 process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID='public-client-id.apps.googleusercontent.com';
 process.env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET='public-secret-of-distinct-app';
 process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
 process.env.PUBLIC_SIGNIN_MODE='pilot';
 process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='google-sub-a,google-sub-b';
 mock.url=null;mock.called=null;mock.verified=null;
 mock.token={id_token:'signed-jwt-from-sdk',access_token:'granted-access',scope:'openid email profile'};
 mock.claims={iss:'https://accounts.google.com',aud:process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID,
  exp:Math.floor(Date.now()/1000)+3600,nonce:'random-protected-nonce',sub:'google-sub-a',
  email:'person@example.test',email_verified:true};
});
afterEach(()=>{process.env=prior});
describe('P10 Google OIDC, no legacy fallback, provider PKCE and encrypted scoped grants',()=>{
 it('requires distinct public credentials; never falls back to an owner app',()=>{
  delete process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID;
  process.env.GOOGLE_OAUTH_CLIENT_ID='legacy-owner';
  expect(()=>publicGoogleClient()).toThrow('public_google_not_configured');
  process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID='public-client';
  expect(publicGoogleClient()).toBeTruthy();
  expect(mock.clientId.id).toBe('public-client');
  expect(mock.clientId.redirect).toBe('https://mcp.example.test/api/auth/google/callback');
 });
 it('fails closed if only a public-prefixed or original owner OAuth secret exists',()=>{
  delete process.env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET;
  process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET='do-not-read-public-config';
  process.env.GOOGLE_OAUTH_CLIENT_SECRET='legacy-owner-secret';
  expect(()=>publicGoogleClient()).toThrow('public_google_not_configured');
  process.env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET='server-only-secret';
  const client=publicGoogleClient();
  expect(client).toBeTruthy();
  expect(mock.clientId.secret).toBe('server-only-secret');
  expect(mock.clientId.secret).not.toBe(process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET);
 });
 it('requests only OIDC login scopes with S256 and binds state/nonce',()=>{
  const client=publicGoogleClient();
  const result=providerUrl({client,state:'opaque-state',nonce:'opaque-nonce',verifier:'client-verifier'});
  expect(result).toContain('accounts.google.com');
  expect(mock.url).toMatchObject({state:'opaque-state',nonce:'opaque-nonce',
    code_challenge_method:'S256',scope:['openid','email','profile'],access_type:'online'});
  expect(mock.url.code_challenge).toBe(crypto.createHash('sha256').update('client-verifier').digest('base64url'));
  providerUrl({client,state:'state2',nonce:'nonce2',verifier:'proof',group:'calendar'});
  expect(mock.url.scope).toContain('https://www.googleapis.com/auth/calendar');
  expect(mock.url.access_type).toBe('offline');
  expect(()=>providerUrl({client,state:'x',nonce:'y',verifier:'z',group:'admin'})).toThrow('invalid_scope_group');
 });
 it('trusts SDK verified JWT, exact audience/issuer/nonce/sub/email verification only',async()=>{
  const client=publicGoogleClient();
  const args={client,code:'opaque-google-code',verifier:'provider-verifier',nonceHash:digest('random-protected-nonce')};
  const identity=await verifyGoogleCode(args);
  expect(identity).toMatchObject({issuer:'https://accounts.google.com',sub:'google-sub-a',email:'person@example.test'});
  expect(mock.verified).toMatchObject({idToken:'signed-jwt-from-sdk',audience:process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID});
  expect(mock.called).toMatchObject({code:'opaque-google-code',codeVerifier:'provider-verifier',
    redirect_uri:'https://mcp.example.test/api/auth/google/callback'});
  for(const changes of [
    {aud:'foreign-client'},{iss:'https://attacker.example.test'},{email_verified:false},
    {email:'unverified'},{sub:''},{exp:Math.floor(Date.now()/1000)-1},
    {nonce:'other-nonce'}
  ]){
    mock.claims={...mock.claims,...changes};
    await expect(verifyGoogleCode(args)).rejects.toThrow('invalid_verified_identity');
    mock.claims={...mock.claims,...Object.fromEntries(Object.keys(changes).map(k=>[k,{
      aud:process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID,iss:'https://accounts.google.com',
      email_verified:true,email:'person@example.test',sub:'google-sub-a',
      exp:Math.floor(Date.now()/1000)+3600,nonce:'random-protected-nonce'}[k]]))};
  }
 });
 it('honors off/pilot/public only after stable verified subject, not an email hint',()=>{
  expect(admitted('google-sub-a')).toBe(true);
  expect(admitted('evil-sub')).toBe(false);
  process.env.PUBLIC_SIGNIN_MODE='off';
  expect(publicMode()).toBe('off');
  expect(admitted('google-sub-a')).toBe(false);
  process.env.PUBLIC_SIGNIN_MODE='public';
  expect(admitted('evil-sub')).toBe(true);
  process.env.PUBLIC_SIGNIN_MODE='invalid';
  expect(()=>publicMode()).toThrow('invalid_public_mode');
 });
 it('requires a single separately owner-listed numeric subject for identity-only legacy coexistence',()=>{
  const eligible='123456789012345678901';
  process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321098765432109,'+eligible;
  expect(legacyPilotLoginAllowed(eligible)).toBe(false);
  process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=eligible;
  expect(legacyPilotLoginAllowed(eligible)).toBe(true);
  expect(legacyPilotLoginAllowed('987654321098765432109')).toBe(false);
  expect(legacyPilotLoginAllowed('nonlisted-subject')).toBe(false);
  process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=eligible+',987654321098765432109';
  expect(legacyPilotLoginAllowed(eligible)).toBe(false);
  process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=eligible;
  process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED='true';
  expect(legacyPilotLoginAllowed(eligible)).toBe(false);
  process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED='false';
  process.env.PUBLIC_SIGNIN_MODE='public';
  expect(legacyPilotLoginAllowed(eligible)).toBe(false);
  process.env.PUBLIC_SIGNIN_MODE='off';
  expect(legacyPilotLoginAllowed(eligible)).toBe(false);
  process.env.PUBLIC_SIGNIN_MODE='pilot';
  process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321098765432109';
  expect(legacyPilotLoginAllowed(eligible)).toBe(false);
  process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321098765432109,'+eligible;
  process.env.PUBLIC_PILOT_LEGACY_SUBJECTS='an-email@example.test';
  expect(legacyPilotLoginAllowed(eligible)).toBe(false);
 });
 it('binds AES-GCM encrypted envelopes to exact principal/account/purpose with no legacy fallback',()=>{
  const p=crypto.randomUUID(),a=crypto.randomUUID(),content={access_token:'x',refresh_token:'y'};
  const sealed=sealV2(content,p,a,'google-grant');
  expect(sealed.startsWith('v2.')).toBe(true);
  expect(openV2(sealed,p,a,'google-grant')).toEqual(content);
  expect(()=>openV2(sealed,crypto.randomUUID(),a,'google-grant')).toThrow();
  expect(()=>openV2(sealed,p,a,'provider-transaction')).toThrow();
  expect(()=>openV2('v1:plaintext',p,a,'google-grant')).toThrow('invalid_v2_envelope');
  delete process.env.TOKEN_ENCRYPTION_KEY;
  expect(()=>sealV2(content,p,a,'google-grant')).toThrow('v2_encryption_key_missing');
 });
 it('uses secure HttpOnly SameSite cookies and rejects duplicated name values',()=>{
  const value=cookie('p10_session','p10s_protected');
  expect(value).toContain('HttpOnly; Secure; SameSite=Lax');
  expect(readCookie({headers:{cookie:'p10_session=first; p10_session=second'}},'p10_session')).toBeNull();
 });
});
