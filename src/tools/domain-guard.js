// Keeps a connection inside its own business. A connection acting as ops@rentals.example may only
// manage users, groups, domains and licenses on the domains allowed for that account (its own domain
// unless someone widened the list with workspace_set_allowed_domains). Asking about anything else
// is refused with a plain message, unless the call says crossDomain: true.
//
// What it can and cannot see: it checks the email addresses and domain names given in the arguments.
// A bare user ID, "me" or "all" carries no domain, so it is let through, and so are list tools that are
// not aimed at one person (they list the whole Workspace the account administers).
import { ok } from './util.js';
import { domainOfEmail } from '../domains.js';

const EMAIL_ARGS = ['userKey', 'userId', 'primaryEmail', 'email', 'groupKey', 'groupEmail', 'memberEmail', 'alias', 'userEmail', 'fromUserId', 'toUserId', 'managerEmail', 'transferDriveAndCalendarTo', 'assignedToUserKey', 'recoveryEmail'];
const EMAIL_LIST_ARGS = ['groupEmails', 'aliases', 'accountEmails'];
const DOMAIN_ARGS = ['domainName', 'domainAliasName', 'parentDomainName', 'domain'];
const TOOL_FAMILY = /^(admin|licensing|datatransfer|workflow|identity|reports|vault)_/;
const CROSS_DOMAIN_FIELD = { type: 'boolean', description: 'Set to true only when you really mean to act on an address or domain outside the domains this connection is limited to.' };

const clean = (v) => String(v ?? '').trim().toLowerCase();

/** Every domain the arguments point at: [{ arg, value, domain }]. Values with no domain in them (IDs, "me", "all") are skipped. */
export function domainsTargeted(args = {}) {
  const found = [];
  const addEmail = (arg, value) => { const d = domainOfEmail(value); if (d) found.push({ arg, value: clean(value), domain: d }); };
  for (const arg of EMAIL_ARGS) if (typeof args[arg] === 'string') addEmail(arg, args[arg]);
  for (const arg of EMAIL_LIST_ARGS) if (Array.isArray(args[arg])) for (const v of args[arg]) if (typeof v === 'string') addEmail(arg, v);
  for (const arg of DOMAIN_ARGS) if (typeof args[arg] === 'string' && args[arg].trim()) found.push({ arg, value: clean(args[arg]), domain: clean(args[arg]).replace(/^@/, '') });
  return found;
}

/** The targets outside `allowed` (a list of domain names). */
export function outsideDomains(args, allowed) {
  const ok_ = new Set((allowed || []).map(clean));
  return domainsTargeted(args).filter((t) => !ok_.has(t.domain));
}

export function refusal(violations, clients) {
  const list = violations.map((v) => `${v.value}${v.arg === 'domainName' || v.arg === 'domain' ? '' : ` (domain ${v.domain})`}`).join(', ');
  return `Refused: ${list} is outside what this connection may manage. It acts as ${clients.actingAs}, which is limited to ${clients.allowedDomains.join(', ')}. Nothing was changed. If you really mean to, run it again with crossDomain: true (ask the person first), or switch to the connection for that business.`;
}

/** Wrap the admin-style tools in `registry`. Returns the same registry. */
export function applyDomainGuard(registry) {
  registry.tools = registry.tools.map((tool) => {
    if (!TOOL_FAMILY.test(tool.name)) return tool;
    const props = tool.inputSchema?.properties || {};
    const aimed = [...EMAIL_ARGS, ...EMAIL_LIST_ARGS, ...DOMAIN_ARGS].some((a) => a in props);
    if (!aimed) return tool;
    const inner = registry.handlers[tool.name];
    registry.handlers[tool.name] = async (args = {}, clients) => {
      const { crossDomain, ...rest } = args;
      if (crossDomain !== true && Array.isArray(clients?.allowedDomains)) {
        const bad = outsideDomains(rest, clients.allowedDomains);
        if (bad.length) return ok(refusal(bad, clients));
      }
      return inner(rest, clients);
    };
    return { ...tool, description: `${tool.description} Limited to this connection's own business domains unless crossDomain: true.`, inputSchema: { ...tool.inputSchema, properties: { ...props, crossDomain: CROSS_DOMAIN_FIELD } } };
  });
  return registry;
}
