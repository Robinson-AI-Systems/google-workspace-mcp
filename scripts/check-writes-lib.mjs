// The rule behind scripts/check-writes.mjs, kept separate so tests can feed it made-up tools.
export const READ_VERBS = /^[a-z]+_(get|list|search|find|check|query|read|export|download|fetch|lookup|view|count|whoami|summary|plan|where|resolve|batch_get|inbox)(_|$)/;
export const READ_AREAS = /^reports_/; // Admin Reports API: every tool is a read
// Tools that only read (or that carry their own confirm and send only on request) but do not start with a read verb.
export const READ_ONLY = {
  workspace_delegation_status: 'reads setup state (and tries a harmless profile read)',
  workflow_email_health: 'reads DNS and mail settings',
  workflow_health_report: 'reads security settings',
  workflow_weekly_digest: 'reads; emailing it needs its own confirm (digest.js)',
  workflow_audit_external_sharing: 'reads',
  workflow_security_snapshot: 'reads',
  workflow_search_presence_check: 'reads',
  workspace_recent_changes: 'reads the change log'
};


/** Names of tools (from a list of { name, inputSchema }) that have no safety layer and are not read-only. */
export function findMissing(tools) {
  return tools.filter((t) => !t.inputSchema?.properties?.dryRun && !READ_VERBS.test(t.name) && !READ_AREAS.test(t.name) && !READ_ONLY[t.name]).map((t) => t.name);
}
