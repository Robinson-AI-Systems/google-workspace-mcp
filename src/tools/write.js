// One place that makes a changing tool safe.
//
//   dryRun: true      -> shows exactly what would change and changes nothing
//   confirm: true     -> required before a destructive tool does anything
//   after the change  -> Google is asked what it holds NOW, and that is what is returned
//                        (not what we sent), and the change is written to the change log.
//
// defineWrite() builds a tool from four small pieces. guard() (below) wraps a tool that
// already exists, using its old handler as the "apply" step.
import { ok } from './util.js';
import { recordChange } from '../changelog.js';

const DRY_RUN_FIELD = { type: 'boolean', description: 'Preview only: say what would change and change nothing.' };
const CONFIRM_FIELD = { type: 'boolean', description: 'Must be true for this to go ahead. Ask the person first; this is hard or impossible to undo.' };

export function safetyNote(destructive, sometimes = false) {
  if (sometimes && !destructive) return ' SAFETY: pass dryRun: true to preview without changing anything. Some uses of this tool (the result says which) are risky and then do nothing until you pass confirm: true (ask the person first). Returns what Google holds afterwards and is written to the change log.';
  return destructive
    ? ' SAFETY: does nothing until you pass confirm: true (ask the person first). Pass dryRun: true to preview exactly what would change. Returns what Google holds afterwards and is written to the change log.'
    : ' Pass dryRun: true to preview without changing anything. Returns what Google holds afterwards and is written to the change log.';
}

export function isNotFound(err) {
  const reason = String(err?.response?.data?.error?.errors?.[0]?.reason || '');
  return Number(err?.response?.status || err?.code) === 404 || reason === 'notFound' || /^not ?found$/i.test(reason);
}

function reasonOf(err) {
  return String(err?.response?.data?.error?.message || err?.message || err).slice(0, 200);
}

/** Pull the JSON out of a tool result (the `ok(...)` shape), if there is any. */
function detailsOf(result) {
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string') return undefined;
  try { return JSON.parse(text); } catch { return text; }
}

/**
 * @param {object} spec
 * @param {string} spec.name
 * @param {string} spec.description
 * @param {object} spec.inputSchema
 * @param {boolean} [spec.destructive]       always needs confirm: true
 * @param {(args) => boolean} [spec.confirmWhen]  needs confirm: true only for some arguments (e.g. an update that suspends someone)
 * @param {(args, before, after, details) => boolean} [spec.verify]  false when what Google holds afterwards is not what was asked for
 * @param {(args, clients) => {summary: string, target?: string, readBefore?: () => Promise<any>}} spec.plan
 * @param {(args, clients) => Promise<any>} spec.apply          does the change; may return an `ok(...)` result
 * @param {(args, clients, details) => Promise<any>} [spec.readAfter]  asks Google what it holds now
 * @returns {{ tool: object, handler: Function }}
 */
export function defineWrite({ name, description, inputSchema, destructive = false, confirmWhen, plan, apply, readAfter, verify }) {
  const schema = JSON.parse(JSON.stringify(inputSchema || { type: 'object', properties: {} }));
  schema.properties = { ...(schema.properties || {}), dryRun: DRY_RUN_FIELD };
  const canNeedConfirm = destructive === true || typeof confirmWhen === 'function';
  const needsConfirm = (args) => destructive === true || (typeof confirmWhen === 'function' && confirmWhen(args) === true);
  if (canNeedConfirm) schema.properties.confirm = { ...CONFIRM_FIELD, ...(inputSchema?.properties?.confirm || {}), type: 'boolean' };
  if (Array.isArray(schema.required)) schema.required = schema.required.filter((k) => k !== 'confirm'); // dryRun alone must be a valid call
  const tool = { name, description: description + safetyNote(destructive === true, canNeedConfirm), inputSchema: schema };

  const handler = async (args = {}, clients) => {
    const { dryRun, confirm, ...rest } = args;
    const callArgs = inputSchema?.properties?.confirm ? { ...rest, confirm: true } : rest; // tools that already took `confirm` still get it once it is given

    const p = await plan(callArgs, clients);
    let before;
    try { before = p.readBefore ? await p.readBefore() : undefined; }
    catch (err) { before = { unreadable: reasonOf(err) }; } // informational; the change itself will report the real problem

    if (dryRun === true) {
      const logged = await recordChange(clients, { tool: name, target: p.target, summary: `PREVIEW: ${p.summary}`, before, dryRun: true });
      return ok({ done: false, dryRun: true, summary: p.summary, target: p.target, before, note: 'Nothing was changed. Run it again without dryRun to do it.' + (needsConfirm(callArgs) ? ' It will also need confirm: true.' : ''), logged: logged.logged });
    }
    if (needsConfirm(callArgs) && confirm !== true) {
      return ok({ done: false, needsConfirmation: true, summary: p.summary, target: p.target, before, note: 'Nothing was changed. Ask the person, then run it again with confirm: true (or dryRun: true to preview).' });
    }

    const result = await apply(callArgs, clients);       // a Google error here propagates: nothing is logged for a change that did not happen
    const details = detailsOf(result);

    let after; let confirmed = readAfter ? true : null; // null: nothing was read back, so nothing is claimed
    try { after = readAfter ? await readAfter(callArgs, clients, details) : undefined; }
    catch (err) { after = { unreadable: reasonOf(err) }; confirmed = false; }

    if (after && after.exists === true) confirmed = false; // asked for a deleted thing and Google still has it
    let mismatch = false;
    if (confirmed === true && verify) {
      try { mismatch = verify(callArgs, before, after, details) === false; } catch { mismatch = true; } // a check that cannot run is not a pass
      if (mismatch) confirmed = false;                       // Google answered, but not with what was asked for
    }
    const logged = await recordChange(clients, { tool: name, target: p.target, summary: p.summary + (confirmed === false ? (mismatch ? ' (asked, but Google does not show the requested result)' : ' (changed, but could not confirm it by reading it back)') : ''), before, after });
    return ok({ done: true, summary: p.summary, target: p.target, before, after, confirmed, ...(mismatch ? { warning: 'Google does not show the result that was asked for. Check it before telling the person it worked.' } : {}), details, logged: logged.logged });
  };
  return { tool, handler };
}

/**
 * Wrap an existing tool. Its old handler becomes the apply step; everything else comes from `spec`:
 *   describe(args) -> { summary, target }
 *   before(args, clients) -> what Google holds now (optional)
 *   after(args, clients, details) -> what Google holds after (optional)
 */
export function guard(tool, oldHandler, spec) {
  const built = defineWrite({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
    destructive: spec.destructive === true,
    confirmWhen: spec.confirmWhen,
    plan: (args, clients) => {
      const d = spec.describe(args);
      return { summary: d.summary, target: d.target, readBefore: spec.before ? () => spec.before(args, clients) : undefined };
    },
    apply: oldHandler,
    readAfter: spec.after,
    verify: spec.verify
  });
  return built;
}

/** For deletions: ask for the item again. Not found means it is gone. */
export function gone(get) {
  return async (args, clients) => {
    try {
      const data = await get(args, clients);
      if (data && (data.deleted === true || data.deletionMetadata)) return { exists: false, note: 'Google keeps a record marked as deleted.' };
      if (data && data.status === 'cancelled') return { exists: false, note: 'Google keeps a "cancelled" marker for deleted events.' };
      return { exists: true, stillThere: data };
    } catch (err) {
      if (isNotFound(err)) return { exists: false };
      throw err;
    }
  };
}
