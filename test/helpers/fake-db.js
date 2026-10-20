import {normalizeBillingPolicy} from '../../src/rtc/billing-authority.js';
import {passOptions} from '../../src/rtc/pass-options.js';
import {loadKey, encryptJson, decryptJson} from '../../src/crypto.js';
// An in-memory stand-in for src/db.js, so unit tests can run the real login
// page, tool and OAuth code without Postgres. It must behave like the real
// module; test/contract/db-contract.js runs the SAME checks against both this
// and a real Postgres, so the two cannot quietly drift apart.
//
// `createFakeDb({ clock })` makes a fresh, empty database. The clock is a
// function returning the current time in milliseconds, so tests can move time
// forward (for lockout windows and token expiry) without waiting.
import crypto from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { normalizeDomains, domainOfEmail } from '../../src/domains.js';
const norm = (email) => String(email || '').trim().toLowerCase();

export function createFakeDb({ clock = () => Date.now() } = {}) {
  const state = {
    legacyTokens: null,
    encryptedOnlyAt: null,
    accounts: new Map(),
    clients: new Map(),
    codes: new Map(),
    tokens: [],
    refreshRevocations: new Set(),
    attempts: [],
    nextAttemptId: 1,
    changes: [],
    resources: [],
    nextChangeId: 1,
    rtcResults: new Map(),
    rtcPasses: new Map(),
    rtcLimits: new Map(),
    devRuns: new Map()
  };
  const at = () => new Date(clock());
  const afterSeconds = (s) => new Date(clock() + s * 1000);

  const api = {
    connectionId: (accessToken) => crypto.createHash('sha256').update(String(accessToken), 'utf8').digest('hex').slice(0, 8),
    async initSchema() {},

    async startDevRun({id,actingAs,connection,scenario,folder=null,calendarId=null,requestSpec=null}){
      if(!id||!actingAs||!connection)throw Error('Authenticated unique run required.');
      const old=state.devRuns.get(id);
      if(old) {
       if(old.request_spec===null&&requestSpec!==null)throw Error('Legacy fixture run requires an exact-ID reviewed recovery plan, never recreation.');
       if(old.acting_as!==norm(actingAs)||old.connection!==connection||old.scenario!==scenario||old.root_folder!==folder||old.calendar_id!==calendarId||!isDeepStrictEqual(old.request_spec,requestSpec))
         throw Error('Run ID belongs to a different account, connection, scenario, immutable request or root folder.');
       return {created:false,runId:id};
      }
      state.devRuns.set(id,{id,acting_as:norm(actingAs),connection,scenario,root_folder:folder,calendar_id:calendarId,request_spec:structuredClone(requestSpec),created_at:at(),objects:[],steps:[]});
      return {created:true,runId:id};
    },
    async reserveDevStep({runId,actingAs,connection,kind}){
      const r=state.devRuns.get(runId);
      if(!r||r.acting_as!==norm(actingAs)||r.connection!==connection)throw Error('Unauthorized or unreserved development step.');
      let step=r.steps.find(x=>x.kind===kind);
      if(step)return {...step,created:false};
      step={kind,state:'pending',google_id:null};
      r.steps.push(step);return {...step,created:true};
    },
    async recordDevObject({runId,actingAs,connection,kind,googleId,parentId=null}){
      const r=state.devRuns.get(runId);
      if(!r||r.acting_as!==norm(actingAs)||r.connection!==connection||!googleId)throw Error('Fixture was not recorded for the requesting connection.');
      const found=r.objects.filter(o=>o.kind===kind);
      if(found.length&&found[0].google_id!==googleId)throw Error('Conflicting fixture ID; manual reconciliation required.');
      if(!found.length)r.objects.push({kind,google_id:googleId,parent_id:parentId,cleaned_at:null});
    },
    async markDevStepRecorded({runId,actingAs,connection,kind,googleId}){
      const r=state.devRuns.get(runId);
      if(!r||r.acting_as!==norm(actingAs)||r.connection!==connection)throw Error('Development step could not be reconciled.');
      const step=r.steps.find(x=>x.kind===kind);
      if(!step||(step.google_id&&step.google_id!==googleId))throw Error('Development step could not be reconciled.');
      step.state='recorded';step.google_id=googleId;
    },
    async listDevRuns({actingAs,connection}){
      return [...state.devRuns.values()].filter(r=>r.acting_as===norm(actingAs)&&r.connection===connection)
       .map(r=>({id:r.id,scenario:r.scenario,created_at:r.created_at,reserved:r.steps.length,pending:r.steps.filter(s=>s.state==='pending').length}));
    },

    async markDevObjectCleaned({runId,actingAs,connection,kind,googleId}){
      const r=state.devRuns.get(runId);
      if(!r||r.acting_as!==norm(actingAs)||r.connection!==connection)throw Error('Fixture cleanup ledger write was refused.');
      const o=r.objects.find(x=>x.kind===kind&&x.google_id===googleId);
      if(!o)throw Error('Fixture cleanup ledger write was refused.');
      o.cleaned_at=at();
    },
    async getDevRun({runId,actingAs,connection}){
      const r=state.devRuns.get(runId);
      return r&&r.acting_as===norm(actingAs)&&r.connection===connection?{...r,objects:r.objects.map(o=>({...o})),steps:r.steps.map(s=>({...s}))}:null;
    },

    async storeRtcResult({handle,connection,payload,ttlHours=24}) {state.rtcResults.set(handle,{connection,payload,expires_at:afterSeconds(ttlHours)});return handle;},
    async getRtcResult(handle,connection){const r=state.rtcResults.get(handle);return r&&r.connection===connection&&r.expires_at>at()?r.payload:null;},

    async listGoogleAccounts() {
      return [...state.accounts.values()]
        .sort((a, b) => (Number(b.is_default) - Number(a.is_default)) || (a.created_at - b.created_at))
        .map(({ email, label, is_default, created_at, updated_at, allowed_domains }) => ({ email, label, is_default, created_at, updated_at, allowed_domains: allowed_domains?.length ? allowed_domains : [norm(email).split('@')[1]], allowed_domains_custom: !!allowed_domains?.length }));
    },
    async getAllowedDomains(email) {
      const a = state.accounts.get(norm(email));
      return a?.allowed_domains?.length ? a.allowed_domains : [norm(email).split('@')[1] || ''];
    },
    async setAllowedDomains(email, domains) {
      const e = norm(email);
      const a = state.accounts.get(e);
      const list = normalizeDomains(domains);
      if (!a) throw new Error(`No connected Google account named ${e}.`);
      a.allowed_domains = list.length ? list : null;
      return list.length ? list : [e.split('@')[1]];
    },
    async getDefaultGoogleAccount() {
      return (await api.listGoogleAccounts())[0]?.email || null;
    },
    async getGoogleTokensFor(email) {
      const row = state.accounts.get(norm(email));
      if (!row) return null;
      if (!state.encryptedOnlyAt) return row.tokens;
      const key = loadKey();
      if (!key || !row.tokens_enc) throw Error('Encrypted Google tokens unavailable; reconnect using the approved recovery procedure.');
      try { return decryptJson(row.tokens_enc, key); }
      catch { throw Error('Encrypted Google token integrity check failed; no plaintext fallback is allowed.'); }
    },
    async saveGoogleTokensFor(email, tokens, { label, source } = {}) {
      const e = norm(email);
      const previous = state.accounts.get(e);
      const key = loadKey();
      if (state.encryptedOnlyAt && !key) throw Error('A valid TOKEN_ENCRYPTION_KEY is required for encrypted-only storage.');
      const before = state.encryptedOnlyAt && previous
        ? await api.getGoogleTokensFor(e) : (previous?.tokens || {});
      const merged = { ...before, ...tokens };
      const encrypted = key ? encryptJson(merged, key) : null;
      if (state.encryptedOnlyAt && source === 'refresh' && state.legacyTokens?.refresh_token &&
        [before.refresh_token,merged.refresh_token].includes(state.legacyTokens.refresh_token)) state.legacyTokens = {};
      if (previous) {
        previous.tokens = state.encryptedOnlyAt ? {} : merged;
        previous.tokens_enc = encrypted;
        previous.tokens_enc_verified_at = encrypted ? at() : null;
        previous.tokens_enc_refreshed_at = encrypted && source === 'refresh' ? at() : previous.tokens_enc_refreshed_at;
        previous.label = label || previous.label;
        previous.updated_at = at();
      } else {
        state.accounts.set(e, { email:e, label:label || null, tokens:state.encryptedOnlyAt ? {} : merged,
          tokens_enc:encrypted, tokens_enc_verified_at:encrypted ? at() : null,
          tokens_enc_refreshed_at:encrypted && source === 'refresh' ? at() : null,
          is_default:state.accounts.size === 0, created_at:at(), updated_at:at() });
      }
    },
    async inspectGoogleTokenRetirement() {
      const key = loadKey(), rows = [...state.accounts.values()];
      const problems = { missingKey: !key, noAccounts: rows.length === 0,
        missingCopy:0, corruptOrStale:0, unverifiedBackfill:0, refreshNotObserved:0 };
      for (const row of rows) {
        if (!row.tokens_enc) { problems.missingCopy++; continue; }
        if (!row.tokens_enc_verified_at) problems.unverifiedBackfill++;
        if (!row.tokens_enc_refreshed_at) problems.refreshNotObserved++;
        if (key) {
          try {
            const decrypted = decryptJson(row.tokens_enc,key);
            if (!state.encryptedOnlyAt && !isDeepStrictEqual(decrypted,row.tokens)) problems.corruptOrStale++;
          } catch { problems.corruptOrStale++; }
        }
      }
      return {encryptedOnly:!!state.encryptedOnlyAt,accountsChecked:rows.length,
        legacyPlaintextCopies:state.legacyTokens && Object.keys(state.legacyTokens).length ? 1 : 0,
        plaintextAccounts:rows.filter(row=>Object.keys(row.tokens||{}).length>0).length,
        ready:rows.length > 0 && !!key && Object.values(problems).every(x=>x===false || x===0),
        problems,notBefore:null};
    },
    async activateGoogleTokenRetirement({ownerConfirmed=false}={}) {
      if (!ownerConfirmed) throw Error('Independent owner confirmation required; no tokens retired.');
      if (state.encryptedOnlyAt) return {activated:false,alreadyActive:true};
      const readiness = await api.inspectGoogleTokenRetirement();
      if (!readiness.ready) throw Error('Every Google account needs an intact encrypted backfill and observed refresh before retirement.');
      state.encryptedOnlyAt = at();
      return {activated:true,alreadyActive:false};
    },
    async setDefaultGoogleAccount(email) {
      const e = norm(email);
      if (!state.accounts.has(e)) throw new Error(`No connected Google account named ${e}.`);
      for (const a of state.accounts.values()) a.is_default = a.email === e;
    },
    async removeGoogleAccount(email) {
      state.accounts.delete(norm(email));
    },
    async migrateLegacyGoogleAuth(resolveEmail) {
      if (state.accounts.size > 0) return null;
      if (!state.legacyTokens || !Object.keys(state.legacyTokens).length) return null;
      const email = norm(await resolveEmail(state.legacyTokens));
      if (!email) throw new Error('Could not determine which mailbox the existing Google sign-in belongs to.');
      await api.saveGoogleTokensFor(email, state.legacyTokens, { label: 'Migrated from single-account setup' });
      return email;
    },
    async getGoogleTokens() {
      const email = await api.getDefaultGoogleAccount();
      return email ? api.getGoogleTokensFor(email) : null;
    },
    async saveGoogleTokens(tokens) {
      const email = await api.getDefaultGoogleAccount();
      if (!email) throw new Error('No Google account connected yet.');
      return api.saveGoogleTokensFor(email, tokens);
    },

    async createOAuthClient({ clientId, clientSecret, redirectUris, clientName }) {
      if (state.clients.has(clientId)) throw new Error('duplicate key value violates unique constraint "oauth_clients_pkey"');
      state.clients.set(clientId, { client_id: clientId, client_secret: clientSecret, redirect_uris: redirectUris, client_name: clientName || null });
    },
    async getOAuthClient(clientId) {
      return state.clients.get(clientId) || null;
    },

    async createAuthCode({ code, clientId, redirectUri, codeChallenge, codeChallengeMethod, googleAccount, profile = 'full', listing = 'catalog', areas = null, mode = 'live', costPolicy={mode:'per_action'}, ttlSeconds = 600 }) {
      state.codes.set(code, {
        code, client_id: clientId, redirect_uri: redirectUri,
        code_challenge: codeChallenge || null, code_challenge_method: codeChallengeMethod || null,
        google_account: googleAccount ? norm(googleAccount) : null, profile, listing, areas,mode,cost_policy:normalizeBillingPolicy(costPolicy,{account:googleAccount}),
        expires_at: afterSeconds(ttlSeconds), used: false
      });
    },
    async consumeAuthCode(code,{clientId,redirectUri,verifier}={}) {
      const row=state.codes.get(code);
      if(!row||row.used||row.expires_at<=at()||row.client_id!==clientId||
       row.redirect_uri!==redirectUri||row.code_challenge_method!=='S256'||
       typeof verifier!=='string'||!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)||
       row.code_challenge!==crypto.createHash('sha256').update(verifier).digest('base64url'))return null;
      const snapshot={...row};row.used=true;return snapshot;
    },

    async createAccessToken({ accessToken, refreshToken, clientId, googleAccount, profile = 'full', listing = 'catalog', areas = null, mode = null, costPolicy={mode:'per_action'}, cost_policy, ttlSeconds = 3600 * 24 * 30 }) {
      if(refreshToken&&state.refreshRevocations.has(clientId+':'+crypto.createHash('sha256').update(refreshToken).digest('hex')))
        throw Error('refresh_family_revoked');
      state.tokens.push({
        access_token: accessToken, refresh_token: refreshToken || null, client_id: clientId,
        google_account: googleAccount ? norm(googleAccount) : null, profile, listing, areas,mode,cost_policy:normalizeBillingPolicy(cost_policy ?? costPolicy,{account:googleAccount}),
        expires_at: afterSeconds(ttlSeconds), created_at: at(), last_used_at: null, revoked_at: null
      });
    },
    async getTokenByRefreshToken(refreshToken) {
      if (!refreshToken) return null;
      const rows = state.tokens.filter((t) => t.refresh_token === refreshToken && !t.revoked_at &&
       !state.refreshRevocations.has(t.client_id+':'+crypto.createHash('sha256').update(refreshToken).digest('hex')))
       .sort((a, b) => b.created_at - a.created_at);
      return rows[0] ? { client_id: rows[0].client_id, google_account: rows[0].google_account, profile: rows[0].profile, listing: rows[0].listing, areas: rows[0].areas,mode:rows[0].mode,cost_policy:rows[0].cost_policy } : null;
    },
    async getAccessToken(accessToken) {
      const row = state.tokens.find((t) => t.access_token === accessToken && t.expires_at > at() && !t.revoked_at &&
       (!t.refresh_token||!state.refreshRevocations.has(t.client_id+':'+crypto.createHash('sha256').update(t.refresh_token).digest('hex'))));
      return row ? { ...row } : null;
    },
    async revokeClientOAuthToken(token,clientId) {
      const owned=state.tokens.filter(t=>t.client_id===clientId&&!t.revoked_at&&
        (t.access_token===token||t.refresh_token===token));
      if(owned.length===0)return 0;
      const families=new Set(owned.map(t=>t.refresh_token).filter(Boolean));
      for(const f of families)state.refreshRevocations.add(clientId+':'+crypto.createHash('sha256').update(f).digest('hex'));
      let revoked=0;
      for(const t of state.tokens)if(t.client_id===clientId&&!t.revoked_at&&
        (owned.some(x=>x.access_token===t.access_token)||families.has(t.refresh_token))){
        t.revoked_at=at();revoked++;
      }
      return revoked;
    },
    async deleteAccessToken(accessToken) {
      state.tokens = state.tokens.filter((t) => t.access_token !== accessToken);
    },

    async touchAccessToken(accessToken) {
      const row = state.tokens.find((t) => t.access_token === accessToken);
      if (row && (!row.last_used_at || row.last_used_at.getTime() < clock() - 60 * 1000)) row.last_used_at = at();
    },
    async createRtcPass(options){
      const {account,areas,limit,ttl,forHub,allowWrites,profile,mode}=passOptions(options);
      if(!state.accounts.has(account))throw new Error('Unknown connected account.');
      if(mode==='test'&&!String(process.env.RTC_TEST_ACCOUNT_EMAILS||'').split(',')
        .map(x=>x.trim().toLowerCase()).includes(account))throw Error('Scratch account not authorized.');
      const token='rtc_pass_'+crypto.randomBytes(32).toString('base64url');
      const hash=crypto.createHash('sha256').update(token).digest('hex'),id='pass_'+hash.slice(0,20);
      const cost_policy=mode==='test'?{mode:'deny'}:normalizeBillingPolicy(options.costPolicy,{account});
      state.rtcPasses.set(id,{id,token_hash:hash,google_account:account,areas,profile,
        listing:'compact',mode,cost_policy,allow_writes:allowWrites,for_hub:forHub,
        rate_limit_per_minute:limit,created_at:at(),expires_at:afterSeconds(ttl*3600),revoked_at:null});
      return {token,id};
    },
    async getRtcPass(token){
      if(typeof token!=='string'||!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(token))return null;
      const hash=crypto.createHash('sha256').update(token).digest('hex');
      const row=[...state.rtcPasses.values()].find(x=>x.token_hash===hash&&!x.revoked_at&&x.expires_at>at());
      if(!row)return null;
      const enrolled=String(process.env.RTC_TEST_ACCOUNT_EMAILS||'').split(',')
        .some(x=>x.trim().toLowerCase()===row.google_account);
      return row.mode==='live'||row.mode==='test'&&enrolled?{...row}:null;
    },
    async rtcPassFailureCode(token){
      if(typeof token!=='string'||!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(token))return 'permission';
      const hash=crypto.createHash('sha256').update(token).digest('hex');
      const row=[...state.rtcPasses.values()].find(x=>x.token_hash===hash);
      if(!row)return 'permission';
      if(row.revoked_at)return 'pass_revoked';
      if(row.expires_at<=at())return 'pass_expired';
      return 'permission';
    },
    async revokeRtcPass(id){const row=state.rtcPasses.get(id);if(!row||row.revoked_at)return 0;row.revoked_at=at();return 1;},
    async listRtcPasses(){return [...state.rtcPasses.values()].map(({token_hash,...rest})=>({...rest,connection_id:rest.id,kind:'pass'}));},
    async chargeRtcPass(id,limit){const key=id+':'+Math.floor(clock()/60000);const n=state.rtcLimits.get(key)||0;if(n>=limit)return false;state.rtcLimits.set(key,n+1);return true;},
    async listConnections() {
      const connectors=state.tokens.filter((t) => t.expires_at > at())
        .sort((a, b) => b.created_at - a.created_at)
        .map((t) => ({
          kind: 'connector',token_prefix: t.access_token.slice(0, 8), connection_id: crypto.createHash('sha256').update(t.access_token, 'utf8').digest('hex').slice(0, 8), client_id: t.client_id, client_name: state.clients.get(t.client_id)?.client_name ?? null,
          google_account: t.google_account, profile: t.profile, listing: t.listing, areas: t.areas, created_at: t.created_at, expires_at: t.expires_at, last_used_at: t.last_used_at, revoked_at: t.revoked_at
        }));
      return [...connectors,...(await api.listRtcPasses()).map(p=>({...p,token_prefix:p.id}))].sort((x,y)=>new Date(y.created_at)-new Date(x.created_at));
    },
    async revokeConnection(prefix) {
      const p = String(prefix || '');
      if (p.length < 8) return { revoked: 0, reason: 'too_short' };
      if(p.startsWith('pass_'))return {revoked:await api.revokeRtcPass(p)};
      const found = state.tokens.filter((t) => t.access_token.startsWith(p));
      if (found.length === 0) return { revoked: 0, reason: 'not_found' };
      if (found.length > 1) return { revoked: 0, reason: 'ambiguous' };
      return {revoked:await api.revokeClientOAuthToken(found[0].access_token,found[0].client_id)};
    },

    async recordChange({ actingAs, connection, tool, target, summary, before, after, dryRun }) {
      const id = state.nextChangeId++;
      const copy = (v) => (v === undefined || v === null ? null : JSON.parse(JSON.stringify(v)));
      state.changes.push({ id, at: at(), acting_as: actingAs || null, connection: connection || null, tool, target: target || null, summary: summary || null, before: copy(before), after: copy(after), dry_run: !!dryRun });
      return id;
    },
    async getOwnedChange(id, actingAs, connection) {
      if(!Number.isSafeInteger(Number(id))||Number(id)<1||!actingAs||!connection)return null;
      return state.changes.find(c=>Number(c.id)===Number(id)&&norm(c.acting_as)===norm(actingAs)&&c.connection===connection)||null;
    },
    async listRecentChanges({ since, tool, actingAs, limit = 50, includeDryRuns = true } = {}) {
      const n = Math.min(Math.max(Number(limit) || 50, 1), 500);
      const from = since ? new Date(since).getTime() : null;
      return state.changes
        .filter((c) => (from === null || c.at.getTime() >= from) && (!tool || c.tool === tool) && (!actingAs || c.acting_as === norm(actingAs)) && (includeDryRuns === true || !c.dry_run))
        .sort((a, b) => (b.at - a.at) || (b.id - a.id))
        .slice(0, n);
    },

    async recordLoginAttempt(ip) {
      const id = String(state.nextAttemptId++);
      state.attempts.push({ id, ip, attempted_at: at(), success: false });
      return id;
    },
    async markLoginAttemptSucceeded(id) {
      const row = state.attempts.find((a) => a.id === String(id));
      if (row) row.success = true;
    },
    async countRecentFailedLogins(ip, minutes) {
      const since = clock() - minutes * 60 * 1000;
      return state.attempts.filter((a) => a.ip === ip && !a.success && a.attempted_at.getTime() > since).length;
    },

    async listBusinessResources(business, kind) {
      return state.resources.filter((r) => r.business === business && (!kind || r.kind === kind)).sort((a, b) => (a.kind + a.key).localeCompare(b.kind + b.key)).map((r) => ({ ...r }));
    },
    async saveBusinessResource({ business, kind, key, googleId }) {
      const row = state.resources.find((r) => r.business === business && r.kind === kind && r.key === key);
      if (row) { row.google_id = googleId; row.updated_at = at(); } else state.resources.push({ business, kind, key, google_id: googleId, updated_at: at() });
    },

    // Test-only helper: put a pre-multi-account sign-in in place.
    __seedLegacyGoogleAuth(tokens) { state.legacyTokens = tokens; },
    __state: state
  };
  return api;
}
