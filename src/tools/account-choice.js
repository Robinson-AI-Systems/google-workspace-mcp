// Choosing which linked Google account a tool call works on.
//
// Any tool call may name `account`: the email address or the label of one of
// the Google accounts linked to this service. Leaving it out keeps the
// connection's own account, so existing connections behave exactly as before.
// The value is taken off the arguments before the tool sees them.

export const ACCOUNT_PROPERTY = Object.freeze({
  type: 'string',
  description: "Which linked Google account to use (email or label). Default: this connection's."
});

export function takeAccount(args = {}) {
  if (!args || typeof args !== 'object' || !Object.hasOwn(args, 'account')) return { account: undefined, rest: args || {} };
  const { account, ...rest } = args;
  if (account === undefined || account === null || account === '') return { account: undefined, rest };
  if (typeof account !== 'string' || account.length > 320) throw new Error('invalid_args: account must be an email address or account label.');
  return { account: account.trim(), rest };
}

const listOf = accounts => accounts.map(a => a.label ? `${a.email} ("${a.label}")` : a.email).join(', ');

// Exact email first, then a label that names exactly one account.
export function matchLinkedAccount(wanted, accounts = []) {
  const want = String(wanted).trim().toLowerCase();
  const byEmail = accounts.filter(a => String(a.email).toLowerCase() === want);
  if (byEmail.length === 1) return byEmail[0].email;
  const byLabel = accounts.filter(a => a.label && String(a.label).trim().toLowerCase() === want);
  if (byLabel.length === 1) return byLabel[0].email;
  if (byLabel.length > 1) throw new Error(`outside_scope: More than one linked account is labelled "${wanted}". Use the email address instead: ${listOf(byLabel)}.`);
  throw new Error(accounts.length
    ? `outside_scope: "${wanted}" is not one of the Google accounts linked here. Linked accounts: ${listOf(accounts)}.`
    : 'outside_scope: No Google accounts are linked to this service yet.');
}

// A connection that can use only its own account: naming that same account
// is fine; naming another is refused with a plain explanation.
export function onlyThisAccount(wanted, actingAs) {
  if (actingAs && String(wanted).trim().toLowerCase() === String(actingAs).toLowerCase()) return;
  throw new Error(`outside_scope: This connection works with ${actingAs || 'one Google account'} only. To use another account, connect it separately for now.`);
}
