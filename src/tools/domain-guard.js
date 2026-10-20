// Keeps a connection inside its own business. A connection acting as ops@rentals.example may only
// manage users, groups, domains and licenses on the domains allowed for that account (its own domain
// unless someone widened the list with workspace_set_allowed_domains). Asking about anything else
// is refused with a plain message, unless the call says crossDomain: true.
//
// What it can and cannot see: it checks the email addresses and domain names given in the arguments.
// A bare user ID, "me" or "all" carries no domain, so it is let through, and so are list tools that are
// not aimed at one person (they list the whole Workspace the account administers).
import { ok } from './util.js';
import { isGuardedWrite,inheritGuardedWrite } from './write.js';
import { domainOfEmail } from '../domains.js';

const EMAIL_ARGS = ['emailTo', 'userKey', 'userId', 'primaryEmail', 'email', 'groupKey', 'groupEmail', 'memberEmail', 'alias', 'userEmail', 'fromUserId', 'toUserId', 'managerEmail', 'transferDriveAndCalendarTo', 'assignedToUserKey', 'recoveryEmail'];
const EMAIL_LIST_ARGS = ['groupEmails', 'aliases', 'accountEmails'];
const DOMAIN_ARGS = ['domainName', 'domainAliasName', 'parentDomainName', 'domain', 'scope']; // scope: a domain, or the word "all" (which targets no domain)
const TOOL_FAMILY = /^(admin|licensing|datatransfer|workflow|identity|reports|vault|dns|domain|postmaster)_/;
const DOMAIN_SCOPED_DRIVE_MEMBERSHIP = new Set(['drive_share_file']);
const CROSS_DOMAIN_FIELD = { type: 'boolean', description: 'Set to true only when you really mean to act on an address or domain outside the domains this connection is limited to.' };
// Reports API "all" queries and customer-wide usage reports may expose activity
// from other businesses even when no outside email appears in the arguments.
// An opaque Google user ID is not proof of membership in the allowed domain.
const UNFILTERABLE_CUSTOMER_READS=new Set(['admin_get_customer_info']);
const DOMAIN_DEFAULT_LISTS=new Set(['admin_list_users','admin_list_groups']);
const reportsNeedOrganizationConsent = (name, args) =>
  name.startsWith('reports_') && (name === 'reports_usage_customer' ||
    !domainOfEmail(args.userKey));

const clean = (v) => String(v ?? '').trim().toLowerCase();

/** Every domain the arguments point at: [{ arg, value, domain }]. Values with no domain in them (IDs, "me", "all") are skipped. */
export function domainsTargeted(args = {}) {
  const found = [];
  const addEmail = (arg, value) => { const d = domainOfEmail(value); if (d) found.push({ arg, value: clean(value), domain: d }); };
  for (const arg of EMAIL_ARGS) if (typeof args[arg] === 'string') addEmail(arg, args[arg]);
  for (const arg of EMAIL_LIST_ARGS) if (Array.isArray(args[arg])) for (const v of args[arg]) if (typeof v === 'string') addEmail(arg, v);
  for (const arg of DOMAIN_ARGS) if (typeof args[arg] === 'string' && args[arg].trim() && !(arg === 'scope' && clean(args[arg]) === 'all')) found.push({ arg, value: clean(args[arg]), domain: clean(args[arg]).replace(/^@/, '') });
  return found;
}

/** The targets outside `allowed` (a list of domain names). */
export function outsideDomains(args, allowed) {
  const ok_ = new Set((allowed || []).map(clean));
  return domainsTargeted(args).filter((t) => !ok_.has(t.domain));
}

export function refusal(violations, clients) {
  const list = violations.map((v) => `${v.value}${['domainName', 'domain', 'scope'].includes(v.arg) ? '' : ` (domain ${v.domain})`}`).join(', ');
  return `Refused: ${list} is outside what this connection may manage. It acts as ${clients.actingAs}, which is limited to ${clients.allowedDomains.join(', ')}. Nothing was changed. If you really mean to, run it again with crossDomain: true (ask the person first), or switch to the connection for that business.`;
}

/** Wrap the admin-style tools in `registry`. Returns the same registry. */
export function applyDomainGuard(registry) {
  registry.tools = registry.tools.map((tool) => {
    if (!TOOL_FAMILY.test(tool.name) && !DOMAIN_SCOPED_DRIVE_MEMBERSHIP.has(tool.name)) return tool;
    const props = tool.inputSchema?.properties || {};
    const aimed = DOMAIN_SCOPED_DRIVE_MEMBERSHIP.has(tool.name) ||
      UNFILTERABLE_CUSTOMER_READS.has(tool.name) || tool.name.startsWith('reports_') ||
      [...EMAIL_ARGS, ...EMAIL_LIST_ARGS, ...DOMAIN_ARGS].some((a) => a in props);
    if (!aimed) return tool;
    const inner = registry.handlers[tool.name];
    const wrapper = async (args = {}, clients) => {
      const { crossDomain, ...rest } = args;
      // The top-level tool arg is one source of explicit consent. A trusted
      // server-created per-call child context is another (owner overview read
      // composition). Both are request-local; neither changes stored grants.
      const authorized = crossDomain === true || clients?.crossDomain === true;
      if (!authorized && Array.isArray(clients?.allowedDomains)) {
        // Customer-wide Directory endpoints have no domain filter. Never
        // silently disclose other business domains from a restricted client.
        if (UNFILTERABLE_CUSTOMER_READS.has(tool.name))
          return ok('Refused: customer-wide account details may include other business domains. Nothing was read. Ask the owner and explicitly use crossDomain: true for this Workspace customer.');
        // Google Directory list without a domain uses my_customer (ALL domains).
        // Pin normal reads to the selected connection domain. The explicit
        // crossDomain flag restores the provider's full-customer capability.
        if (DOMAIN_DEFAULT_LISTS.has(tool.name) && !String(rest.domain||'').trim()) {
          if (!clients.allowedDomains.length)
            return ok('Refused: this connection has no verified allowed domain for Directory listing. Nothing was read.');
          rest.domain=clients.allowedDomains[0];
        }
        if (reportsNeedOrganizationConsent(tool.name, rest)) {
          return ok('Refused: This Reports request can include activity from other business domains. Nothing was read. Use an email in an allowed domain, or ask the owner before using crossDomain: true for the customer-wide report.');
        }
        if ('scope' in props && (!String(rest.scope ?? '').trim() || clean(rest.scope) === 'all')) {
          return ok(`Refused: scope "all" covers every domain in the Workspace, but this connection acts as ${clients.actingAs}, which is limited to ${clients.allowedDomains.join(', ')}. Nothing was read. Give one of those domains as the scope, or run it again with crossDomain: true (ask the person first).`);
        }
        const bad = outsideDomains(rest, clients.allowedDomains);
        if (DOMAIN_SCOPED_DRIVE_MEMBERSHIP.has(tool.name) && typeof rest.emailAddress === 'string') {
          const email = rest.emailAddress.trim().toLowerCase();
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
            return ok('Refused: a shared member must have a valid email address. Nothing was changed.');
          if (!clients.allowedDomains.map(clean).includes(email.slice(email.lastIndexOf('@')+1)))
            return ok('Refused: sharing with an outside domain requires independent owner approval, crossDomain: true and confirm: true. Nothing was changed.');
        }
        if (bad.length) return ok(refusal(bad, clients));
        if (DOMAIN_SCOPED_DRIVE_MEMBERSHIP.has(tool.name) && rest.type==='domain') return ok('Refused: domain-wide access requires crossDomain: true and independent owner confirmation. Nothing was changed.');
      }
      return inner(rest, authorized && clients?.crossDomain !== true
        ? Object.create(clients || {}, { crossDomain: { value: true, enumerable: true } })
        : clients);
    };
    registry.handlers[tool.name]=isGuardedWrite(inner)?inheritGuardedWrite(inner,wrapper):wrapper;
    return { ...tool, description: `${tool.description} Limited to this connection's own business domains unless crossDomain: true.`, inputSchema: { ...tool.inputSchema, properties: { ...props, crossDomain: CROSS_DOMAIN_FIELD } } };
  });
  return registry;
}
