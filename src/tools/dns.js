// DNS records for domains whose DNS is hosted at Vercel (nameservers *.vercel-dns.com), through Vercel's REST API.
// Needs VERCEL_API_TOKEN (and VERCEL_TEAM_ID for a team account) in the server's environment.
// Domains whose DNS lives somewhere else are refused with a plain explanation of where it does live.
import dns from 'node:dns/promises';
import { ok } from './util.js';
import { defineWrite } from './write.js';

const API = 'https://api.vercel.com';
// SRV is left out on purpose: Vercel takes it in a different shape from the others and it has not been proven against the live service.
const TYPES = ['A', 'AAAA', 'CNAME', 'TXT', 'MX', 'CAA'];
const clean = (s) => String(s ?? '').trim().toLowerCase();

/** "@", "", the bare domain, or "name.domain" all become the part Vercel wants: "" for the apex, otherwise "name". */
export function relativeName(name, domain) {
  let n = clean(name).replace(/\.$/, '');
  if (n === '@') return '';
  if (n === domain) return '';
  if (n.endsWith(`.${domain}`)) n = n.slice(0, -(domain.length + 1));
  return n;
}

function vercelConfig(clients) {
  const v = clients?.vercel || {};
  return { token: v.token ?? process.env.VERCEL_API_TOKEN, teamId: v.teamId ?? process.env.VERCEL_TEAM_ID, fetch: v.fetch ?? globalThis.fetch };
}

async function call(clients, method, path, body) {
  const { token, teamId, fetch } = vercelConfig(clients);
  if (!token) throw new Error('DNS changes need VERCEL_API_TOKEN set in the server\'s environment (Vercel dashboard > this project > Settings > Environment Variables). It is not set, so nothing was done.');
  const url = `${API}${path}${teamId ? `${path.includes('?') ? '&' : '?'}teamId=${encodeURIComponent(teamId)}` : ''}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 15000);
  let res;
  try { res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: ctl.signal }); }
  catch (err) { throw new Error(err?.name === 'AbortError' ? 'Vercel did not answer within 15 seconds.' : `Could not reach Vercel: ${err.message}`); }
  finally { clearTimeout(timer); }
  const text = await res.text();
  let data; try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }
  if (!res.ok) {
    const msg = data?.error?.message || data?.message || `HTTP ${res.status}`;
    throw new Error(res.status === 401 || res.status === 403 ? `Vercel refused the token (${msg}). Check VERCEL_API_TOKEN and that it can see this team.` : `Vercel said: ${msg}`);
  }
  return data;
}

/** Is this domain's DNS served by Vercel? Looks at the real nameservers, not at what we hope. */
export async function vercelHostsDns(domain, clients) {
  const resolver = clients?.dnsResolver || dns;
  let ns = [];
  try { ns = (await resolver.resolveNs(domain)).map(clean); } catch { ns = []; }
  return { hosted: ns.length > 0 && ns.every((n) => /\.vercel-dns\.com\.?$/.test(n)), nameservers: ns };
}

async function requireVercelDns(domain, clients) {
  const { hosted, nameservers } = await vercelHostsDns(domain, clients);
  if (hosted) return;
  throw new Error(nameservers.length
    ? `${domain} does not use Vercel for DNS (its nameservers are ${nameservers.join(', ')}). Change its records at whoever runs those nameservers, or point the domain at Vercel's nameservers first. Nothing was changed.`
    : `Could not find nameservers for ${domain}, so I cannot tell where its DNS lives. Nothing was changed.`);
}

const pick = (r) => ({ id: r.id, name: r.name ?? '', type: r.type, value: r.value, ttl: r.ttl, ...(r.mxPriority != null ? { mxPriority: r.mxPriority } : {}) });
async function listRecords(domain, clients) {
  const seen = new Map();
  let until;
  for (let page = 0; ; page += 1) {
    if (page >= 50) throw new Error(`${domain} has more DNS records than this tool will read (5000), so it cannot tell what is already there. Nothing was changed.`);
    const d = await call(clients, 'GET', `/v5/domains/${encodeURIComponent(domain)}/records?limit=100${until ? `&until=${until}` : ''}`);
    if (typeof d !== 'object' || !Array.isArray(d.records)) throw new Error('Vercel answered with something other than a list of records, so nothing was changed.');
    for (const r of d.records) seen.set(r.id, r);
    until = d.pagination?.next;
    if (!until || d.records.length === 0) break;
  }
  return [...seen.values()].map(pick);
}
// Host names compare without case or a trailing dot; text values (TXT, CAA) compare exactly, apart from the outer quotes.
const HOSTNAME_TYPES = ['CNAME', 'MX'];
const sameValue = (type, a, b) => {
  const s = (v) => String(v ?? '').trim();
  if (HOSTNAME_TYPES.includes(type)) return clean(a).replace(/\.$/, '') === clean(b).replace(/\.$/, '');
  if (type === 'A' || type === 'AAAA') return clean(a) === clean(b);
  return s(a).replace(/^"|"$/g, '') === s(b).replace(/^"|"$/g, '');
};
const sameRecord = (x, r) => x.type === r.type && sameValue(r.type, x.value, r.value) && (r.type !== 'MX' || Number(x.mxPriority) === r.mxPriority);

function checkDomain(value) {
  const domain = clean(value);
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain) || domain.includes('..')) throw new Error(`"${value}" is not a domain name.`);
  return domain;
}

function checkRecord(args) {
  const domain = checkDomain(args.domain);
  const type = String(args.type || '').toUpperCase();
  if (!TYPES.includes(type)) throw new Error(`Record type must be one of ${TYPES.join(', ')}.`);
  const name = relativeName(args.name, domain);
  if (!/^(|[a-z0-9_*]([a-z0-9_.*-]*[a-z0-9_*])?)$/.test(name) || name.includes('..')) throw new Error(`"${args.name}" is not a valid record name. Use @ for the bare domain, or a name like _dmarc or mail.`);
  const value = String(args.value ?? '').trim();
  if (!value) throw new Error('A record needs a value.');
  if (/[\r\n]/.test(value)) throw new Error('A record value cannot contain line breaks.');
  const ttl = args.ttl === undefined ? 60 : Number(args.ttl);
  if (!Number.isInteger(ttl) || ttl < 60 || ttl > 2592000) throw new Error('ttl must be a whole number of seconds from 60 to 2592000.');
  let mxPriority;
  if (type === 'MX') {
    mxPriority = Number(args.mxPriority);
    if (!Number.isInteger(mxPriority) || mxPriority < 0 || mxPriority > 65535) throw new Error('An MX record needs mxPriority (a whole number, e.g. 10).');
  }
  return { domain, type, name, value, ttl, mxPriority };
}

const display = (name, domain) => (name ? `${name}.${domain}` : domain);

export const addRecord = defineWrite({
  name: 'dns_add_record',
  description: "Add one DNS record to a domain whose DNS is hosted at Vercel (nameservers *.vercel-dns.com). Refuses domains hosted elsewhere and says where their DNS lives. Adding the exact same record twice does nothing. Refuses a CNAME where other records already exist at that name, and the reverse. name is the part before the domain (_dmarc, mail) or @ for the bare domain. Always asks for confirm: true because a wrong record can stop mail or a website.",
  inputSchema: { type: 'object', properties: { domain: { type: 'string' }, type: { type: 'string', enum: TYPES }, name: { type: 'string', description: '@ for the bare domain, or e.g. _dmarc, mail, www' }, value: { type: 'string' }, ttl: { type: 'number', description: 'Seconds, 60 to 2592000. Default 60.' }, mxPriority: { type: 'number', description: 'Required for MX records' } }, required: ['domain', 'type', 'name', 'value'] },
  confirmWhen: () => true,
  plan: (args, clients) => {
    const r = checkRecord(args);
    return { summary: `Add ${r.type} record ${display(r.name, r.domain)} -> ${r.value}${r.mxPriority != null ? ` (priority ${r.mxPriority})` : ''}, ttl ${r.ttl}`, target: r.domain, readBefore: async () => { await requireVercelDns(r.domain, clients); return { recordsAtName: (await listRecords(r.domain, clients)).filter((x) => x.name === r.name) }; } };
  },
  async apply(args, clients) {
    const r = checkRecord(args);
    await requireVercelDns(r.domain, clients);
    const atName = (await listRecords(r.domain, clients)).filter((x) => x.name === r.name);
    const existing = atName.find((x) => sameRecord(x, r));
    if (existing) return ok({ changed: false, note: `That record is already there${existing.ttl !== r.ttl ? ` (with ttl ${existing.ttl}; its ttl was not changed)` : ''}; nothing was added.`, id: existing.id });
    if (r.type === 'CNAME' && atName.length) throw new Error(`${display(r.name, r.domain)} already has ${atName.map((x) => x.type).join(', ')} record(s); a CNAME cannot share a name with other records. Nothing was changed.`);
    if (r.type !== 'CNAME' && atName.some((x) => x.type === 'CNAME')) throw new Error(`${display(r.name, r.domain)} is a CNAME, which cannot share its name with a ${r.type} record. Nothing was changed.`);
    const created = await call(clients, 'POST', `/v2/domains/${encodeURIComponent(r.domain)}/records`, { name: r.name, type: r.type, value: r.value, ttl: r.ttl, ...(r.mxPriority != null ? { mxPriority: r.mxPriority } : {}) });
    return ok({ changed: true, id: created.uid || created.id });
  },
  readAfter: async (args, clients) => { const r = checkRecord(args); return { recordsAtName: (await listRecords(r.domain, clients)).filter((x) => x.name === r.name) }; },
  verify: (args, _before, after) => { const r = checkRecord(args); return after.recordsAtName.some((x) => sameRecord(x, r)); }
});

export const deleteRecord = defineWrite({
  name: 'dns_delete_record',
  description: 'Delete one DNS record (by recordId from dns_list_records) from a domain whose DNS is hosted at Vercel. Shows exactly which record it will remove. Needs confirm: true. Removing the wrong MX, SPF, DKIM or DMARC record can stop or spoof email, so preview first.',
  inputSchema: { type: 'object', properties: { domain: { type: 'string' }, recordId: { type: 'string' } }, required: ['domain', 'recordId'] },
  destructive: true,
  plan: (args, clients) => {
    const domain = checkDomain(args.domain);
    return { summary: `Delete DNS record ${args.recordId} from ${domain}`, target: domain, readBefore: async () => { await requireVercelDns(domain, clients); return { record: (await listRecords(domain, clients)).find((x) => x.id === args.recordId) || null }; } };
  },
  async apply(args, clients) {
    const domain = checkDomain(args.domain);
    await requireVercelDns(domain, clients);
    const rec = (await listRecords(domain, clients)).find((x) => x.id === args.recordId);
    if (!rec) throw new Error(`No record with id ${args.recordId} on ${domain}. Nothing was deleted; list the records again for the current ids.`);
    await call(clients, 'DELETE', `/v2/domains/${encodeURIComponent(domain)}/records/${encodeURIComponent(args.recordId)}`);
    return ok({ changed: true, deleted: rec });
  },
  readAfter: async (args, clients) => ({ exists: (await listRecords(checkDomain(args.domain), clients)).some((x) => x.id === args.recordId) })
});

export const tools = [
  { name: 'dns_list_records', description: 'List the DNS records of a domain whose DNS is hosted at Vercel (read-only). Refuses domains hosted elsewhere and says where their DNS lives.', inputSchema: { type: 'object', properties: { domain: { type: 'string' } }, required: ['domain'] } },
  addRecord.tool, deleteRecord.tool
];

export const handlers = {
  async dns_list_records(args, clients) {
    const domain = clean(args.domain);
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) return ok({ refused: `"${args.domain}" is not a domain name.` });
    try { await requireVercelDns(domain, clients); } catch (err) { return ok({ domain, hostedAtVercel: false, explanation: err.message }); }
    const records = await listRecords(domain, clients);
    return ok({ domain, hostedAtVercel: true, count: records.length, records });
  },
  dns_add_record: addRecord.handler,
  dns_delete_record: deleteRecord.handler
};
