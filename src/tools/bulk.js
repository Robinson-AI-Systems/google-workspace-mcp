// P7-8: one bounded, owner-confirmed operation on explicitly named mailboxes.
// This composes the FINAL guarded registry, never provider handlers or raw credentials.
import { defineWrite, inheritGuardedWrite, isGuardedWrite } from './write.js';
import { ok } from './util.js';
import { recordChange } from '../changelog.js';
import { outsideDomains } from './domain-guard.js';
import { delegatedGmail, delegationReady, mailboxAllowed } from './delegated.js';
import { allowedTool } from '../rtc/catalog.js';
import { shapeReadResult } from '../rtc/results.js';

const EMAIL = /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)*$/i;
const STATUS = ['preview', 'refused', 'confirmed', 'unverified', 'failed', 'unknown', 'not_attempted'];
const BUDGET_MS = 20_000; // Return a truthful partial report before the hosted request deadline.
const str = { type: 'string' };
const vacationFields = {
  enableAutoReply: { type: 'boolean' }, responseSubject: str, responseBodyPlainText: str,
  responseBodyHtml: str, restrictToContacts: { type: 'boolean' },
  restrictToDomain: { type: 'boolean' }, startTime: { type: 'string' }, endTime: { type: 'string' }
};
const OPS = Object.freeze({
  set_signature: { child: 'workflow_brand_mailbox', keys: ['signatureHtml'], required: ['signatureHtml'], field: 'userEmail' },
  set_vacation: { child: 'workflow_brand_mailbox', keys: ['vacation'], required: ['vacation'], field: 'userEmail' },
  add_group_member: { child: 'admin_add_group_member', keys: ['groupKey', 'role'], required: ['groupKey'], field: 'memberEmail' },
  remove_group_member: { child: 'admin_remove_group_member', keys: ['groupKey'], required: ['groupKey'], field: 'memberEmail' },
  assign_license: { child: 'licensing_assign_license', keys: ['skuId', 'productId'], required: ['skuId'], field: 'userId', spending: true },
  change_license: { child: 'licensing_update_assignment', keys: ['skuId', 'newSkuId', 'productId'], required: ['skuId', 'newSkuId'], field: 'userId', spending: true },
  remove_license: { child: 'licensing_remove_license', keys: ['skuId', 'productId'], required: ['skuId'], field: 'userId' }
});
const plain = v => v !== null && typeof v === 'object' && !Array.isArray(v) && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null);
const invalid = message => { throw new Error('invalid_args: ' + message); };
function email(v) {
  if (typeof v !== 'string' || v.length > 254 || !EMAIL.test(v.trim()) || v.trim() !== v || v.includes('..')) invalid('targets and groupKey must be explicit email addresses');
  return v.toLowerCase();
}
function vacation(v) {
  if (!plain(v) || typeof v.enableAutoReply !== 'boolean') invalid('vacation requires enableAutoReply boolean');
  for (const [key, value] of Object.entries(v)) {
    if (!Object.hasOwn(vacationFields, key) || typeof value !== vacationFields[key].type) invalid('invalid vacation field: ' + key);
    if (typeof value === 'string' && value.length > 16000) invalid('vacation field too long');
  }
  for (const key of ['startTime', 'endTime']) if (v[key] !== undefined && (!/^\d{10,16}$/.test(v[key]) || !Number.isSafeInteger(Number(v[key])))) invalid('vacation time must be milliseconds since epoch');
  if (v.startTime && v.endTime && Number(v.startTime) >= Number(v.endTime)) invalid('vacation end must follow start');
}
export function normalizeBulkArgs(args) {
  if (!plain(args)) invalid('request must be an object');
  const allowed = ['operation','targets','parameters','dryRun','confirm','crossDomain'];
  if (Object.keys(args).some(k => !allowed.includes(k))) invalid('unknown top-level field');
  const op = OPS[args.operation];
  if (!Object.hasOwn(OPS, args.operation) || !op) invalid('unknown operation');
  if (!Array.isArray(args.targets) || args.targets.length < 1 || args.targets.length > 20) invalid('targets must contain 1 to 20 named email addresses');
  const targets = args.targets.map(email);
  if (new Set(targets).size !== targets.length) invalid('duplicate target');
  if (!plain(args.parameters) || Object.keys(args.parameters).some(k => !op.keys.includes(k)) || op.required.some(k => !Object.hasOwn(args.parameters,k))) invalid('invalid parameters for selected operation');
  for (const flag of ['dryRun','confirm','crossDomain']) if (args[flag] !== undefined && typeof args[flag] !== 'boolean') invalid(flag + ' must be boolean');
  const p = { ...args.parameters };
  if ('groupKey' in p) p.groupKey = email(p.groupKey);
  for (const k of ['skuId','newSkuId','productId']) if (k in p && (typeof p[k] !== 'string' || !/^[a-zA-Z0-9._-]{1,120}$/.test(p[k]))) invalid('invalid licensing product or SKU');
  if ('signatureHtml' in p && (typeof p.signatureHtml !== 'string' || p.signatureHtml.length > 16000)) invalid('invalid signatureHtml');
  if ('vacation' in p) vacation(p.vacation);
  if ('role' in p && !['MEMBER','MANAGER','OWNER'].includes(p.role)) invalid('invalid group role');
  if (args.operation === 'add_group_member' && p.role === undefined) p.role = 'MEMBER';
  if ('skuId' in p && p.productId === undefined) p.productId = 'Google-Apps';
  return { operation: args.operation, targets, parameters: p, dryRun: args.dryRun === true, confirm: args.confirm === true, crossDomain: args.crossDomain === true };
}
const schema = { type: 'object', additionalProperties: false, required: ['operation','targets','parameters'], properties: {
  operation: { type: 'string', enum: Object.keys(OPS) },
  targets: { type: 'array', items: { type: 'string', format: 'email' }, minItems: 1, maxItems: 20, uniqueItems: true },
  parameters: { type: 'object', description: 'Only the parameters for the selected operation (strictly validated before dispatch).' },
  crossDomain: { type: 'boolean', description: 'Separate, explicitly owner-authorized cross-business intent; confirmation alone does not grant it.' }
} };
function childArgs(op, p, target, crossDomain) {
  const args = { [op.field]: target };
  for (const key of op.keys) if (Object.hasOwn(p, key)) args[key] = p[key];
  if (crossDomain) args.crossDomain = true;
  return args;
}
function readResult(response) {
  if (response?.isError) return { refused: false, error: true };
  const raw = response?.content?.[0]?.text;
  if (typeof raw !== 'string') return { error: true };
  let value; try { value = JSON.parse(raw); } catch { value = raw; }
  if (typeof value === 'string') return /^refused:|outside_scope|refused_by_guard|not allowed/i.test(value) ? { refused: true } : { error: true };
  if (!plain(value)) return { error: true };
  if (value.refused || value.needsConfirmation || value.done === false && !value.dryRun) return { refused: true };
  if (value.auditFailure || value.logged === false) return { unverified: true, value };
  return { value };
}
const childSafe = (tool, value, matched) => ({ tool, logged: value?.logged === true, confirmed: value?.confirmed === true, ...(matched !== undefined ? { exactReadback: matched } : {}) });
function countsFor(rows) {
  const counts = Object.fromEntries(STATUS.map(s => [s, 0]));
  for (const row of rows) counts[row.status]++;
  return counts;
}
const report = (a, rows, preview) => ({
  operation: a.operation, total: a.targets.length,
  status: preview ? 'preview' : rows.every(r => r.status === 'confirmed') ? 'complete' : 'incomplete',
  counts: countsFor(rows), results: rows
});
function denial(a, target, clients, op) {
  const policy = clients?.rtcPolicy || {};
  if (!allowedTool('workspace_bulk_operation', policy) || !allowedTool(op.child, policy)) return 'outside_scope';
  if (!a.crossDomain && Array.isArray(clients?.allowedDomains) && outsideDomains(childArgs(op, a.parameters, target, false), clients.allowedDomains).length) return 'outside_domain';
  if (op.field === 'userEmail' && (!delegationReady(clients) || !mailboxAllowed(clients, target))) return 'delegation_unavailable';
  // A seat assignment or SKU change can add charges. A bulk confirmation is NOT
  // independent spend approval; no spending authorization signal exists in this contract.
  if (op.spending) return 'independent_spending_approval_required';
  return null;
}
async function readMailboxExact(a, target, clients) {
  const gmail = delegatedGmail(clients, target);
  if (a.operation === 'set_signature') {
    const observed = (await gmail.users.settings.sendAs.get({ userId: 'me', sendAsEmail: target })).data;
    return !!observed && String(observed.sendAsEmail || '').toLowerCase() === target && observed.signature === a.parameters.signatureHtml;
  }
  const observed = (await gmail.users.settings.getVacation({ userId: 'me' })).data;
  return !!observed && Object.entries(a.parameters.vacation).every(([k,v]) => String(observed[k]) === String(v));
}
const commonAuthFailure = err => Number(err?.response?.status || err?.code) === 401 || /connection revoked|token expired|invalid_grant/i.test(String(err?.message || ''));
async function run(a, clients, preview) {
  const registry = (await import('./index.js')).registry;
  const op = OPS[a.operation];
  const handler = registry.handlers[op.child];
  if (!isGuardedWrite(handler)) throw new Error('Guarded child dispatch unavailable.');
  const started = Date.now();
  const rows = [];
  let abort = false;
  for (const target of a.targets) {
    if (abort || Date.now() - started >= BUDGET_MS) {
      rows.push({ target, status: 'not_attempted', reason: abort ? 'common_authorization_lost' : 'request_budget_exhausted' });
      continue;
    }
    const problem = denial(a, target, clients, op);
    if (problem) { rows.push({ target, status: 'refused', reason: problem }); continue; }
    const derived = a.crossDomain ? Object.create(clients || {}, { crossDomain: { value: true, enumerable: true } }) : clients;
    try {
      const response = await handler({ ...childArgs(op, a.parameters, target, a.crossDomain), ...(preview ? { dryRun: true } : { confirm: true }) }, derived);
      const inspected = readResult(response);
      if (inspected.refused) { rows.push({ target, status: 'refused', reason: 'guarded_child_refused' }); continue; }
      if (inspected.error) { rows.push({ target, status: 'failed', reason: 'child_operation_failed' }); continue; }
      const value = inspected.value;
      if (preview) {
        rows.push(inspected.unverified ? { target, status: 'refused', reason: 'preview_audit_unavailable' } : { target, status: 'preview', child: { tool: op.child, eligible: true } });
        continue;
      }
      let exact;
      if (op.field === 'userEmail' && value?.done === true && !inspected.unverified) {
        try { exact = await readMailboxExact(a, target, derived); } catch { exact = false; }
      }
      const confirmed = !inspected.unverified && value?.done === true && value?.logged === true && (op.field === 'userEmail' ? exact === true : value?.confirmed === true);
      rows.push({ target, status: confirmed ? 'confirmed' : 'unverified', child: childSafe(op.child, value, exact) });
    } catch (err) {
      const common = commonAuthFailure(err);
      // A transport failure during dispatch may follow a committed Google mutation.
      rows.push({ target, status: common ? 'unknown' : (Number(err?.response?.status || err?.code) === 403 ? 'refused' : 'unknown'), reason: common ? 'authorization_lost_during_dispatch' : 'child_outcome_unconfirmed' });
      if (common) abort = true;
    }
  }
  return report(a, rows, preview);
}
const built = defineWrite({
  name: 'workspace_bulk_operation',
  description: 'Perform one guarded operation for up to 20 explicitly named users. Preview the entire list, obtain fresh owner confirmation and inspect EVERY target result. No automatic retry or rollback; may affect billing.',
  destructive: true, inputSchema: schema,
  plan: a => ({ summary: 'Bulk ' + a.operation + ' for ' + a.targets.length + ' explicitly named targets', target: a.operation }),
  apply: async (a, clients) => ok(await run(a, clients, false))
});
export const tools = [built.tool];
export const handlers = {
  workspace_bulk_operation: inheritGuardedWrite(built.handler, async (raw = {}, clients) => {
    const a = normalizeBulkArgs(raw);
    // The parent write guard supplies the non-preview confirmation fence.
    if (!a.dryRun) {
      const response = await built.handler(a, clients);
      return shapeReadResult(response, { detail: 'full', toolName: 'workspace_bulk_operation' }, clients?.connection);
    }
    // A true combined preview must run each guarded child preview, not just
    // defineWrite's generic summary. Never invoke the parent's apply path here.
    const details = await run(a, clients, true);
    const logged = await recordChange(clients, { tool: 'workspace_bulk_operation', target: a.operation, summary: 'PREVIEW: ' + a.operation + ' for ' + a.targets.length + ' targets', dryRun: true });
    const response = ok({ done: false, dryRun: true, logged: logged.logged, details });
    return shapeReadResult(response, { detail: 'full', toolName: 'workspace_bulk_operation' }, clients?.connection);
  })
};
