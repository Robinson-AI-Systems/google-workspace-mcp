import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const mocks=vi.hoisted(()=>({attempts:0,schemas:0,verdict:'wrong',loginInputs:null,tx:null}));
vi.mock('../../src/principals/store.js',()=>({
 createTransaction:async input=>{mocks.tx=input;return true;}
}));
vi.mock('../../src/db.js',()=>({
 initSchema:async()=>{mocks.schemas++;},
 recordLoginAttempt:async()=>{mocks.attempts++;},
 countRecentFailedLogins:async()=>0,
 markLoginAttemptSucceeded:async()=>{}
}));
vi.mock('../../src/oauth/login-guard.js',()=>({
 clientIp:()=> '198.51.100.2',LOCKOUT_WINDOW_MINUTES:15,
 evaluateLogin:async input=>{mocks.loginInputs=input;return {status:mocks.verdict};}
}));
vi.mock('../../src/principals/owner-migration.js',()=>({
 legacyNewLoginEnabled:()=>process.env.LEGACY_OWNER_SIGNIN_ENABLED!=='false'
}));
import homepage from '../../api/index.js';
import privacy from '../../api/privacy.js';
import support from '../../api/support.js';
import deletion from '../../api/data-deletion.js';
import pilot from '../../api/owner/pilot-readiness.js';
import {pilotReadiness} from '../../src/principals/pilot-readiness.js';
import {PUBLIC_SCOPE_GROUPS,IDENTITY_SCOPES} from '../../src/principals/google.js';

const reply=()=>{
 const r={statusCode:200,headers:{},body:null,ended:false};
 r.setHeader=(k,v)=>{r.headers[k]=v;};
 r.getHeader=k=>r.headers[k];
 r.status=n=>{r.statusCode=n;return r;};
 r.send=v=>{r.body=v;r.ended=true;return r;};
 r.json=v=>{r.body=v;r.ended=true;return r;};
 r.writeHead=(n,headers)=>{r.statusCode=n;Object.assign(r.headers,headers);return r;};
 r.end=()=>{r.ended=true;return r;};
 return r;
};
const request=(method='GET',body={},headers={})=>({method,body,headers});
let old;
beforeEach(()=>{
 old={...process.env};mocks.attempts=0;mocks.schemas=0;mocks.verdict='wrong';
 mocks.loginInputs=null;mocks.tx=null;
 process.env.PUBLIC_BASE_URL='https://mcp.example.test';
 process.env.ADMIN_PASSPHRASE='correct-passphrase-for-tests';
 process.env.GOOGLE_OAUTH_CLIENT_ID='legacy-client';
 process.env.GOOGLE_OAUTH_CLIENT_SECRET='legacy-secret';
 process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID='different-public-client';
 process.env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET='different-public-secret';
 process.env.TOKEN_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
 process.env.PUBLIC_SUPPORT_EMAIL='support@example.test';
 process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='google-sub-a,google-sub-b';
 process.env.PUBLIC_SIGNIN_MODE='off';
 delete process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED;
 delete process.env.LEGACY_OWNER_SIGNIN_ENABLED;
});
afterEach(()=>{process.env=old;});
describe('P10-6 public preflight information and disclosure URLs',()=>{
 it('home is public, links privacy/support/deletion, and cannot reveal untrusted mailbox data',()=>{
  const privateEmail='hidden-owner@example.test';
  const r=reply();
  homepage(request('GET',{}, {cookie:'p10_session='+privateEmail}),
    r);
  expect(r.statusCode).toBe(200);
  expect(r.body).toContain('/api/account');
  expect(r.body).toContain('/api/privacy');
  expect(r.body).toContain('/api/support');
  expect(r.body).toContain('/api/data-deletion');
  expect(r.body).toContain('/api/mcp');
  expect(r.body).not.toContain(privateEmail);
  expect(mocks.schemas).toBe(0);
  expect(r.headers['Cache-Control']).toContain('no-store');
 });
 it('all public pages disclose limits without claiming Google grant revocation or erased audit logs',()=>{
  for(const [handler,text] of [
    [privacy,'recoverable deletion'],[support,'support@example.test'],
    [deletion,'not verified Google-wide revocation']
  ]){
    const r=reply();handler(request('GET'),r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain(text);
    expect(r.headers['Content-Security-Policy']).toContain("default-src 'none'");
  }
  delete process.env.PUBLIC_SUPPORT_EMAIL;
  const pending=reply();support(request('GET'),pending);
  expect(pending.body).toContain('not configured');
  process.env.PUBLIC_SUPPORT_EMAIL='<img src=x>';
  const invalid=reply();support(request('GET'),invalid);
  expect(invalid.body).not.toContain('<img');
  expect(invalid.body).toContain('not configured');
 });
 it('public HEAD has no body and POST refuses without account or Google queries',()=>{
  for(const handler of [homepage,privacy,support,deletion]){
    const r=reply();handler(request('HEAD'),r);
    expect(r.statusCode).toBe(200);expect(r.body).toBeNull();
    const denied=reply();handler(request('POST',{passphrase:'x'}),denied);
    expect(denied.statusCode).toBe(405);
  }
  expect(mocks.schemas).toBe(0);
 });
});
describe('P10-6 source-derived pilot configuration, without trusting it as acceptance',()=>{
 it('reports actual source scope groups and no authenticated external Google claim',()=>{
  const r=pilotReadiness();
  expect(r.kind).toBe('p10_pilot_readiness');
  expect(r.configComplete).toBe(true);
  expect(r.currentMode).toBe('off');
  expect(r.pilotAcceptancePassed).toBe(false);
  expect(r.publicPublicationApproved).toBe(false);
  expect(r.scopes.identity).toEqual(IDENTITY_SCOPES);
  for(const [k,group] of Object.entries(PUBLIC_SCOPE_GROUPS)){
    expect(r.scopes[k]).toEqual(group);
  }
  expect(r.expectedUrls.oauthCallback).toBe('https://mcp.example.test/api/auth/google/callback');
  const serialized=JSON.stringify(r);
  for(const secret of ['correct-passphrase-for-tests','legacy-secret','different-public-secret',
   'google-sub-a','google-sub-b',process.env.TOKEN_ENCRYPTION_KEY]){
    expect(serialized).not.toContain(secret);
  }
 });
 it('sanitizes the exact legacy identity-only tester configuration and turns off when tools or public login are enabled',()=>{
  const subject='123456789012345678901';
  process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321098765432109,'+subject;
  process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=subject;
  process.env.PUBLIC_SIGNIN_MODE='pilot';
  const r=pilotReadiness();
  expect(r.legacyPilotIdentityOnlyConfigured).toBe(true);
  expect(r.legacyPilotIdentityOnlyEnabled).toBe(true);
  expect(JSON.stringify(r)).not.toContain(subject);
  process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS=subject;
  expect(pilotReadiness().legacyPilotIdentityOnlyEnabled).toBe(false);
  process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS=subject+',987654321098765432109,555555555555555555555';
  expect(pilotReadiness().legacyPilotIdentityOnlyConfigured).toBe(false);
  process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='987654321098765432109,'+subject;
  process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED='true';
  expect(pilotReadiness().legacyPilotIdentityOnlyEnabled).toBe(false);
  delete process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED;
  process.env.PUBLIC_SIGNIN_MODE='public';
  expect(pilotReadiness().legacyPilotIdentityOnlyEnabled).toBe(false);
  process.env.PUBLIC_SIGNIN_MODE='pilot';
  process.env.PUBLIC_PILOT_LEGACY_SUBJECTS='another@example.test';
  expect(pilotReadiness().legacyPilotIdentityOnlyConfigured).toBe(false);
  process.env.PUBLIC_PILOT_LEGACY_SUBJECTS=subject+','+subject;
  expect(pilotReadiness().legacyPilotIdentityOnlyConfigured).toBe(false);
 });
 it('flags missing/duplicated public credentials and rejects roster guesses without changing flags',()=>{
  process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID='legacy-client';
  process.env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET='legacy-secret';
  process.env.PUBLIC_PILOT_GOOGLE_SUBJECTS='same-sub,same-sub';
  delete process.env.PUBLIC_SUPPORT_EMAIL;
  const out=pilotReadiness();
  expect(out.configComplete).toBe(false);
  expect(out.checks.filter(c=>c.status==='action_required').length).toBeGreaterThanOrEqual(4);
  expect(out.pilotRosterCount).toBe(2);
  expect(out.currentMode).toBe('off');
  expect(out.pilotAcceptancePassed).toBe(false);
 });
 it('refuses to call an unsafe public-prefix secret configured and never leaks its value',()=>{
  delete process.env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET;
  process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET='unsafe-config-visible-secret';
  const report=pilotReadiness();
  expect(report.configComplete).toBe(false);
  expect(report.checks.find(c=>c.name==='Separate public Google OAuth client secret')).toMatchObject({
   status:'action_required'
  });
  expect(JSON.stringify(report)).not.toContain('unsafe-config-visible-secret');
 });
 it('public switch still does not turn a local check into authorization for publication',()=>{
  process.env.PUBLIC_SIGNIN_MODE='public';
  process.env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED='true';
  const out=pilotReadiness();
  expect(out.configComplete).toBe(false);
  expect(out.toolExecutionFlagEnabled).toBe(true);
  expect(out.publicPublicationApproved).toBe(false);
 });
 it('rejects a non-HTTPS/wrong origin and incorrectly sized encryption key',()=>{
  process.env.PUBLIC_BASE_URL='http://mcp.example.test';
  process.env.TOKEN_ENCRYPTION_KEY=Buffer.alloc(16,3).toString('base64');
  const report=pilotReadiness();
  expect(report.configComplete).toBe(false);
  expect(report.expectedUrls.oauthCallback).toBeNull();
 });
});
describe('P10-6 owner-only readiness route with existing passphrase lockout',()=>{
 const authHeaders={origin:'https://mcp.example.test',host:'mcp.example.test'};
 it('GET is non-sensitive even if an owner account or cookie is present',async()=>{
  const r=reply();
  await pilot(request('GET',{}, {host:'mcp.example.test',cookie:'p10_session=private'}),r);
  expect(r.statusCode).toBe(200);
  expect(r.body).toContain('Owner passphrase');
  expect(r.headers['Referrer-Policy']).toBe('same-origin');
  // Chromium checks form-action against each redirect in the form's 302 chain.
  // Keep same-origin owner passphrase POST and permit only the Google OAuth origin.
  const csp=r.headers['Content-Security-Policy'];
  expect(csp).toContain("form-action 'self' https://accounts.google.com;");
  expect(csp).toContain("default-src 'none'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("form-action *");
  expect(csp).not.toContain('https://evil.example.test');
  expect(r.body).not.toContain('different-public-client');
  expect(r.body).not.toContain('google-sub-a');
  expect(mocks.schemas).toBe(0);
 });
 it('redirects alias GET to canonical and rejects cross-origin POST before touching auth',async()=>{
  const redirect=reply();await pilot(request('GET',{}, {host:'alias.example.test'}),redirect);
  expect(redirect.statusCode).toBe(303);
  expect(redirect.headers.Location).toBe('https://mcp.example.test/api/owner/pilot-readiness');
  const denied=reply();
  await pilot(request('POST',{passphrase:'correct-passphrase-for-tests'},
    {origin:'https://foreign.example.test'}),denied);
  expect(denied.statusCode).toBe(403);
  expect(mocks.schemas).toBe(0);
  expect(mocks.loginInputs).toBeNull();
 });
 it('wrong passphrase fails with no report, and rate lock returns Retry-After',async()=>{
  const wrong=reply();await pilot(request('POST',{passphrase:'wrong'},authHeaders),wrong);
  expect(wrong.statusCode).toBe(401);
  expect(wrong.body).toEqual({error:'owner_auth_failed'});
  expect(mocks.schemas).toBe(1);
  mocks.verdict='locked';
  const locked=reply();await pilot(request('POST',{passphrase:'wrong'},authHeaders),locked);
  expect(locked.statusCode).toBe(429);
  expect(locked.headers['Retry-After']).toBe('900');
 });
 it('valid existing owner passphrase returns only a sanitized offline checklist',async()=>{
  mocks.verdict='ok';
  const approved=reply();
  await pilot(request('POST',{passphrase:'correct-passphrase-for-tests'},authHeaders),approved);
  expect(approved.statusCode).toBe(200);
  expect(approved.body.pilotAcceptancePassed).toBe(false);
  expect(approved.body.configComplete).toBe(true);
  expect(approved.body.expectedUrls.oauthCallback).toContain('/api/auth/google/callback');
  expect(JSON.stringify(approved.body)).not.toContain('different-public-secret');
  expect(JSON.stringify(approved.body)).not.toContain('google-sub-a');
 });
 it('owner passphrase can prove a tester subject using OIDC only while public is off',async()=>{
  mocks.verdict='ok';
  const r=reply();
  await pilot(request('POST',{passphrase:'correct-passphrase-for-tests',
    action:'verify_pilot_subject'},authHeaders),r);
  expect(r.statusCode).toBe(302);
  expect(r.headers.Location).toContain('accounts.google.com');
  const providerOrigin=new URL(r.headers.Location).origin;
  expect(providerOrigin).toBe('https://accounts.google.com');
  expect(r.headers['Content-Security-Policy']).toContain(
    "form-action 'self' "+providerOrigin+";");
  expect(r.headers['Content-Security-Policy']).toContain("base-uri 'none'");
  expect(r.headers['Set-Cookie']).toContain('p10_google_browser=');
  expect(mocks.tx).toMatchObject({purpose:'login',policy:{pilotProbe:true}});
  expect(mocks.tx.principalId).toBeUndefined();
  expect(mocks.tx.state).toMatch(/^p10st_/);
  expect(r.headers.Location).not.toContain('correct-passphrase-for-tests');
  expect(r.headers.Location).not.toContain('google-sub-a');
 });
 it('disabling new legacy sign-in disables passphrase-based readiness too',async()=>{
  process.env.LEGACY_OWNER_SIGNIN_ENABLED='false';
  mocks.verdict='ok';
  const denied=reply();
  await pilot(request('POST',{passphrase:'correct-passphrase-for-tests'},authHeaders),denied);
  expect(denied.statusCode).toBe(403);
  expect(mocks.schemas).toBe(0);
 });
});
