// Operations helpers: calendar settings, the "where is this setting?" map, the plan summary and the
// search-presence check. (The email health check is in email-health.js.)
import { ok } from './util.js';
import { defineWrite } from './write.js';
import { CONSOLE_MAP, CONSOLE_HOME, CONSOLE_VERIFICATION } from '../data/console-map.js';
import { buildConsoleReview } from '../data/console-review.js';

// ---------- P2-4: where is this setting? ----------
const GENERIC = new Set(['email', 'mail', 'user', 'users', 'file', 'files', 'account', 'people', 'person', 'staff']); // too common to point at one page by themselves
const STOP = new Set(['add', 'the', 'a', 'an', 'to', 'of', 'for', 'in', 'on', 'my', 'our', 'how', 'do', 'i', 'can', 'where', 'is', 'are', 'and', 'or', 'with', 'set', 'setting', 'settings', 'change', 'turn', 'find', 'what', 'it', 'up', 'google', 'workspace', 'admin', 'console']);
const SYNONYMS = { licence: 'license', licences: 'license', licenses: 'license', emails: 'email', mails: 'mail', passwords: 'password', calendars: 'calendar', drives: 'drive', groups: 'group', users: 'user', devices: 'device', apps: 'app', rooms: 'room', 'two-factor': '2fa', mfa: '2fa', '2-step': '2sv' };
const words = (text) => String(text || '').toLowerCase().replace(/[^a-z0-9\- ]+/g, ' ').split(/\s+/).filter(Boolean).map((w) => SYNONYMS[w] || w);

export function matchSettings(query, limit = 3) {
  const q = words(query);
  const text = ` ${q.join(' ')} `;
  const nonStop = q.filter((w) => !STOP.has(w));
  const specific = nonStop.filter((w) => !GENERIC.has(w));
  const meaningful = specific.length ? specific : nonStop;
  const isGeneric = (w) => specific.length > 0 && GENERIC.has(w); // when ALL the words are generic they are all we have, so count them
  if (!meaningful.length) return [];
  const scored = CONSOLE_MAP.map((entry, order) => {
    let score = 0;
    const keywordWords = new Set(entry.keywords.flatMap(words));
    const titleWords = new Set(words(entry.title));
    for (const phrase of [...entry.keywords.map((k) => words(k).join(' ')), entry.id.replace(/-/g, ' ')]) {
      if (phrase.includes(' ') && text.includes(` ${phrase} `)) score += 4;       // whole multi-word phrase
      else if (!phrase.includes(' ') && !isGeneric(phrase) && text.includes(` ${phrase} `)) score += 3; // single keyword
    }
    for (const w of meaningful) {
      if (keywordWords.has(w) && !isGeneric(w)) score += 1;
      if (titleWords.has(w)) score += 2;
      else if (w.length >= 5 && [...titleWords, ...keywordWords].some((x) => x.length >= 5 && (x.startsWith(w) || w.startsWith(x)))) score += 1;
    }
    return { entry, score, order };
  }).filter((s) => s.score > 0).sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map((s) => ({ ...s.entry, score: s.score }));
}

const whereIsSetting = async (args, clients) => {
  if(args.reviewAll===true){
    // Use the same permission classifier as normal RTC listing and dispatch.
    // A suggested readback is never invoked here and never means a policy is
    // verified. This remains usable when no Admin API is available.
    const {allowedTool,isWrite}=await import('../rtc/catalog.js');
    const readback=(id)=>{
      const hint=CONSOLE_VERIFICATION[id];
      if(!hint)return {state:'manual_only',reason:'No scoped Google API readback is available; inspect the Admin console manually.'};
      if(isWrite(hint.tool)||!allowedTool(hint.tool,clients?.rtcPolicy||{}))
        return {state:'outside_scope',reason:'The optional readback is unavailable to this connection; inspect manually or use a separately authorized connection. No read occurred.'};
      return {state:'readback_available',tool:hint.tool,note:hint.note,
        invoked:false,policyVerified:false};
    };
    return ok(buildConsoleReview(args,readback));
  }
  const query = String(args.query || '').trim();
  if (!query) return ok('Say which setting you are looking for, e.g. "turn on DKIM" or "block external sharing".');
  const hits = matchSettings(query);
  if (!hits.length) {
    return ok({ found: false, note: `Nothing in the map matches "${query}". Try other words, or use the search box at the top of ${CONSOLE_HOME} (it searches every setting).`, topics: CONSOLE_MAP.map((e) => e.title) });
  }
  const matches=hits.map(({score,...h})=>({...h,link:h.link||`${CONSOLE_HOME} (follow the clicks below)`,
    steps:h.path.map((p,i)=>`${i+1}. ${p}`)}));
  // The setting finder never executes the linked read. Match each optional
  // readback against this connection's actual profile/area restrictions.
  const {allowedTool,isWrite}=await import('../rtc/catalog.js');
  const guides=hits.map(({score,...h})=>{
    const verification=CONSOLE_VERIFICATION[h.id];
    const available=verification&&!isWrite(verification.tool)&&allowedTool(verification.tool,clients?.rtcPolicy||{});
    return {
      setting:h.title,
      url:h.link||CONSOLE_HOME,
      steps:h.path.map((p,i)=>({n:i+1,action:'Navigate to',target:p})),
      expected:'The identified settings page is visible. No setting has been changed or verified.',
      ...(available?{verifyWith:verification.tool,verificationNote:verification.note}:
        verification?{verificationNote:'The suggested read-back is outside this connection’s allowed areas or profile. Use an authorized connection or check the console manually; nothing was verified.'}:{})
    };
  });
  return ok({found:true,matches,...guides[0],alternatives:guides.slice(1),
    note:'Menu names can move; use Admin console search if a path changes. No changes are claimed.'});

};

// ---------- P2-1: calendar settings ----------
// Accepts every name the runtime's time zone database knows, old and new spellings alike (Asia/Kolkata and Asia/Calcutta).
export const validZone = (name) => { try { new Intl.DateTimeFormat('en', { timeZone: name }); return typeof name === 'string' && name.trim() === name && name.length > 0; } catch { return false; } };
const canonicalZone = (name) => { try { return new Intl.DateTimeFormat('en', { timeZone: name }).resolvedOptions().timeZone; } catch { return name; } };
const sameZone = (a, b) => a === b || (validZone(a) && validZone(b) && canonicalZone(a) === canonicalZone(b)); // Google may store an alias of the name sent
const CAL_FIELDS = ['summary', 'description', 'timeZone', 'location'];

const calendarUpdate = defineWrite({
  name: 'calendar_update_calendar',
  description: "Change a calendar's name, description, time zone or location (calendarId defaults to the primary calendar). The time zone must be an IANA name such as America/Denver. Only the fields you give are changed.",
  inputSchema: { type: 'object', properties: { calendarId: { type: 'string', default: 'primary' }, summary: { type: 'string' }, description: { type: 'string' }, timeZone: { type: 'string', description: 'IANA name, e.g. America/Denver' }, location: { type: 'string' } } },
  plan: (args, clients) => {
    const changes = CAL_FIELDS.filter((f) => args[f] !== undefined);
    if (!changes.length) throw new Error('Nothing to change: give at least one of summary, description, timeZone, location.');
    if (args.timeZone !== undefined) {
      if (!validZone(args.timeZone)) throw new Error(`"${args.timeZone}" is not a time zone name I recognise. Use an IANA name like America/Denver, America/New_York or Europe/London.`);
    }
    const id = args.calendarId || 'primary';
    return { summary: `Update calendar ${id}: ${changes.map((f) => `${f} -> ${JSON.stringify(args[f])}`).join(', ')}`, target: id, readBefore: async () => pickCal((await clients.calendar.calendars.get({ calendarId: id })).data) };
  },
  apply: async (args, { calendar }) => {
    const requestBody = Object.fromEntries(CAL_FIELDS.filter((f) => args[f] !== undefined).map((f) => [f, args[f]]));
    await calendar.calendars.patch({ calendarId: args.calendarId || 'primary', requestBody });
  },
  readAfter: async (args, { calendar }) => pickCal((await calendar.calendars.get({ calendarId: args.calendarId || 'primary' })).data),
  verify: (args, _before, after) => CAL_FIELDS.every((f) => args[f] === undefined || (f === 'timeZone' ? sameZone(after?.[f], args[f]) : (after?.[f] ?? '') === args[f]))
});
const pickCal = (c) => ({ id: c?.id, summary: c?.summary, description: c?.description, timeZone: c?.timeZone, location: c?.location });

// ---------- P2-6: what plan are we on? ----------
// Google's own names for the SKUs (product Google-Apps). Anything else is shown by its ID.
export const SKUS = {
  '1010020027': { name: 'Business Starter', gemini: true },
  '1010020028': { name: 'Business Standard', gemini: true },
  '1010020025': { name: 'Business Plus', gemini: true },
  '1010020026': { name: 'Enterprise Standard', gemini: true },
  '1010020020': { name: 'Enterprise Plus', gemini: true },
  '1010060001': { name: 'Essentials', gemini: false },
  '1010060003': { name: 'Enterprise Essentials', gemini: null },
  '1010020029': { name: 'Enterprise Starter', gemini: null },
  '1010020030': { name: 'Frontline Starter', gemini: false },
  'Google-Apps-For-Business': { name: 'G Suite Basic / Business (legacy)', gemini: false },
  'Google-Apps-Unlimited': { name: 'G Suite Business (legacy)', gemini: false },
  'Google-Apps-Lite': { name: 'G Suite Lite (legacy)', gemini: false }
};

export function geminiVerdict(plans) {
  if (!plans.length) return 'unknown (no licences found)';
  const yes = plans.filter((p) => p.geminiIncluded === true).length;
  const no = plans.filter((p) => p.geminiIncluded === false).length;
  if (yes === plans.length) return 'yes';
  if (no === plans.length) return 'not on these plans';
  if (yes === 0) return 'unknown (plan not recognised)';
  return 'on some plans';
}

export async function planSummary(clients, { customerId, maxPages = 20 } = {}) {
  const counts = new Map();
  let pageToken;
  let pages = 0;
  const seen=new Set();
  let limitReason;
  do {
    if(pageToken&&seen.has(pageToken)){limitReason='pagination_cycle';break;}
    if(pageToken)seen.add(pageToken);
    const res = await clients.licensing.licenseAssignments.listForProduct({ productId: 'Google-Apps', customerId, maxResults: 1000, pageToken });
    for (const a of res.data.items || []) counts.set(a.skuId, (counts.get(a.skuId) || 0) + 1);
    pageToken = res.data.nextPageToken;
    pages++;
  } while (pageToken && pages < maxPages);
  const plans = [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([skuId, assigned]) => ({ skuId, plan: SKUS[skuId]?.name || `Unrecognised plan (${skuId})`, assigned, geminiIncluded: SKUS[skuId] ? SKUS[skuId].gemini : null }));
  return { plans, truncated: Boolean(pageToken),coverage:{pagesRead:pages,complete:!pageToken,...(pageToken?{limitReason:limitReason||'page_limit'}:{})} };
}

// ---------- P2-7: search presence ----------
const stripWww = (d) => String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '').replace(/^www\./, '');
export function checkVerification(items, domain) {
  const root = stripWww(domain);
  const www = `www.${root}`;
  const covered = (name) => (items || []).some((it) => {
    const s = it.site || {};
    const id = String(s.identifier || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/+$/, '');
    if (s.type === 'INET_DOMAIN') return name === id || name.endsWith(`.${id}`); // a verified domain covers its subdomains
    return id === name;
  });
  return { root: { name: root, verified: covered(root) }, www: { name: www, verified: covered(www) } };
}

const searchPresence = async (args, { siteVerification }) => {
  const domain = stripWww(args.domain);
  if (!domain || !domain.includes('.')) return ok('Give the website domain, e.g. example.com.');
  let res;
  try {
    res=await siteVerification.webResource.list({});
  } catch(error) {
    // OAuth consent for Site Verification is optional. A missing scope is not
    // proof that a domain is unverified, and should not stop the owner from
    // receiving useful manual Search Console instructions.
    const status=Number(error?.response?.status||error?.code);
    const reasons=error?.response?.data?.error?.errors||[];
    const missingScope=status===403&&(
      reasons.some(e=>e?.reason==='insufficientPermissions')||
      /insufficient (authentication )?scopes/i.test(String(error?.message||'')));
    if(!missingScope)throw error;
    return ok({
      domain,status:'WARN',readable:false,reason:'site_verification_scope_unavailable',
      verified:{root:{name:domain,verified:null},www:{name:'www.'+domain,verified:null}},
      searchConsole:'The connected Google account cannot read Site Verification. Open https://search.google.com/search-console while signed in as the intended owner to check existing verified properties. If the owner approves Site Verification read access, reconnect this Google account through its normal OAuth consent process; this check cannot grant that permission. Do not add or change DNS records based on this unknown result.',
      businessProfile:'Google Business Profile is separate. Open https://business.google.com while signed in as the account that should own the listing; inspect or claim the business there.',
      note:'Verification status is UNKNOWN, not failed. This is a Google account permission limitation; no DNS, Search Console or Business Profile settings were changed.'
    });
  }
  const v = checkVerification(res.data.items, domain);
  const both = v.root.verified && v.www.verified;
  return ok({
    domain,
    readable:true,
    status: both ? 'PASS' : v.root.verified || v.www.verified ? 'WARN' : 'FAIL',
    verified: v,
    searchConsole: both ? 'Ready: add the property at https://search.google.com/search-console using "Domain" and the domain name; it will be accepted immediately because it is already verified for this account.'
      : `Not verified for this account yet. Run domain_get_verification_token for ${domain}, add the TXT record at the DNS host, then domain_confirm_verification. Then add the property at https://search.google.com/search-console.`,
    businessProfile: 'Google Business Profile has no API this server holds permission for. Open https://business.google.com while signed in as the account that should own the listing, search for the business, and claim or verify it there.',
    note: 'Verification here is per Google account: it only shows sites verified by the account this connection acts as.'
  });
};

export const tools = [
  calendarUpdate.tool,
  { name: 'workspace_where_is_setting', description: 'Find a specific Google Admin setting, or request reviewAll:true to walk the complete mapped manual Admin console checklist by category and page, with scope-aware optional readback instructions but no changes or automatic verification.', inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'One setting to find; optional in reviewAll mode to filter mapped topics.' }, reviewAll: { type: 'boolean', description: 'Return a complete, paginated Admin console review checklist rather than only the top matching settings; no Google reads or writes.' }, category: { type: 'string', enum: ['mail','security','collaboration','organization','devices','billing'], description: 'Optional category filter, used with reviewAll:true.' }, page: { type: 'integer', minimum: 1, maximum: 1000, description: 'Review page (default 1).' }, pageSize: { type: 'integer', minimum: 1, maximum: 20, description: 'Review entries per page (default 10).' } } } },
  { name: 'workspace_plan_summary', description: 'Which Google Workspace plans this company pays for, how many people hold each, and whether Gemini is included. Uses the real customer ID so it works on every domain.', inputSchema: { type: 'object', properties: {} } },
  { name: 'workflow_search_presence_check', description: 'Check Search Console domain verification for this Google account and explain exact next steps. If optional Google permission is missing, explicitly report verification as unknown and provide manual guidance; never infer that DNS or verification is wrong. Read-only.', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } }
];

export const handlers = {
  calendar_update_calendar: calendarUpdate.handler,
  workspace_where_is_setting: whereIsSetting,
  workspace_plan_summary: async (_args, clients) => {
    const { customerIdFor } = await import('./licensing.js');
    const customerId = await customerIdFor(clients);
    const summary = await planSummary(clients, { customerId });
    const total = summary.plans.reduce((n, p) => n + p.assigned, 0);
    return ok({
      customerId, totalLicensesAssigned: total, ...summary,
      geminiIncluded: geminiVerdict(summary.plans),
      note: 'Counts people holding a licence for each plan; free seats are not visible through this API (see the Admin console, Billing > Subscriptions).'
    });
  },
  workflow_search_presence_check: searchPresence
};
