// Fails when a tool that might change things has no safety layer (dryRun preview, read-back, change log).
//
// The rule is the safe way round: EVERY tool must have dryRun unless it is clearly a read (its name
// starts with get/list/search/... after the area prefix) or it is named in READ_ONLY below with the reason.
// So a new tool with an unusual verb (sort, merge, untrash, ...) is caught instead of slipping through.
// Run by `npm run check` and CI.
process.env.DATABASE_URL ||= 'postgres://user:pass@localhost/none';
const { registry } = await import('../src/tools/index.js');

const READ_VERBS = /^[a-z]+_(get|list|search|find|check|query|read|export|download|fetch|lookup|view|count|whoami|summary|plan|where|resolve|batch_get|inbox)(_|$)/;
const READ_AREAS = /^reports_/; // Admin Reports API: every tool is a read
// Tools that only read (or that carry their own confirm and send only on request) but do not start with a read verb.
const READ_ONLY = {
  workspace_delegation_status: 'reads setup state (and tries a harmless profile read)',
  workflow_email_health: 'reads DNS and mail settings',
  workflow_health_report: 'reads security settings',
  workflow_weekly_digest: 'reads; emailing it needs its own confirm (digest.js)',
  workflow_audit_external_sharing: 'reads',
  workflow_security_snapshot: 'reads',
  workflow_search_presence_check: 'reads',
  workspace_recent_changes: 'reads the change log'
};

const hasSafety = (t) => !!t.inputSchema?.properties?.dryRun;
const missing = registry.tools
  .filter((t) => !hasSafety(t) && !READ_VERBS.test(t.name) && !READ_AREAS.test(t.name) && !READ_ONLY[t.name])
  .map((t) => t.name);
const stale = Object.keys(READ_ONLY).filter((n) => !registry.tools.some((t) => t.name === n));
if (missing.length) console.error(`These tools have no dryRun/confirm safety layer and are not listed as read-only:\n  ${missing.join('\n  ')}\nAdd them to the safety table (src/tools/guards*.js), or, if they truly only read, to READ_ONLY in scripts/check-writes.mjs with a reason.`);
if (stale.length) console.error(`READ_ONLY lists tools that do not exist (remove them):\n  ${stale.join('\n  ')}`);
process.exit(missing.length || stale.length ? 1 : 0);
