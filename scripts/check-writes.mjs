// Fails when a tool that changes things has not been given the safety layer (dryRun preview, read-back, change log).
// Run by `npm run check` and CI. Tools that only read are listed below with the reason they are exempt.
process.env.DATABASE_URL ||= 'postgres://user:pass@localhost/none';
const { registry } = await import('../src/tools/index.js');

const CHANGING = /_(create|update|delete|add|remove|set|move|send|assign|reset|suspend|unsuspend|undelete|patch|modify|trash|empty|revoke|insert|copy|upload|restore|clear|append|replace|import|forward|mark|star|unstar|reply|rename|make|transfer|start|stop|watch|quick|grant|apply|enable|disable|onboard|offboard|brand|share|unshare|publish)(_|$)/;
// Tools whose name looks like a change but only read. Keep each with a reason.
const READ_ONLY = {
  gmail_get_label: 'reads one label', gmail_list_send_as: 'lists send-as addresses', drive_list_trash: 'lists trash',
  drive_get_start_page_token: 'reads a token', sheets_batch_get: 'reads ranges', datatransfer_get_transfer_status: 'reads a status',
  workflow_audit_external_sharing: 'reads', workflow_security_snapshot: 'reads',
  workflow_search_presence_check: 'reads', workflow_weekly_digest: 'emails only with its own confirm; see digest.js'
};

const missing = registry.tools
  .filter((t) => CHANGING.test(t.name) && !READ_ONLY[t.name] && !t.inputSchema?.properties?.dryRun)
  .map((t) => t.name);
const stale = Object.keys(READ_ONLY).filter((n) => !registry.tools.some((t) => t.name === n));
if (missing.length) { console.error(`These tools change things but have no dryRun/confirm safety layer:\n  ${missing.join('\n  ')}`); }
if (stale.length) { console.error(`READ_ONLY lists tools that do not exist (remove them):\n  ${stale.join('\n  ')}`); }
process.exit(missing.length || stale.length ? 1 : 0);
