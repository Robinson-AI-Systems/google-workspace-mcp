// Turns Google's errors into plain English: what happened, the likely cause,
// and what to do next. The raw Google message is always kept at the end under
// "Technical detail", so nothing is hidden. An error we do not recognise is
// shown exactly as before ("Error: <message>").

function parts(err) {
  const data = err?.response?.data;
  const nested = data?.error && typeof data.error === 'object' ? data.error : null;
  const message = nested?.message || (typeof data?.error_description === 'string' ? data.error_description : null) || err?.message || String(err);
  const status = Number(err?.response?.status || err?.code || nested?.code) || null;
  const reason = String(nested?.errors?.[0]?.reason || nested?.status || (typeof data?.error === 'string' ? data.error : '') || '');
  const details = nested?.errors;
  const retryAfter = Number(err?.response?.headers?.['retry-after']) || null;
  return { message: String(message), status, reason, details, retryAfter, location: nested?.errors?.[0]?.location || null };
}

const RECONNECT = 'Open /api/google/authorize on your server while signed in as that mailbox to connect it again.';

/** Returns { what, cause, todo } for errors we recognise, or null. */
export function explainError(err) {
  const { message, status, reason, retryAfter, location } = parts(err);
  // A network failure (no answer from Google at all, e.g. ENOTFOUND) is not any of the Google errors below.
  if (!err?.response && typeof err?.code === 'string') return null;
  const has = (re) => re.test(message) || re.test(reason); // wording Google puts in the message or the reason
  const reasonIs = (re) => re.test(reason);                 // Google's own reason code only

  if (has(/Access restricted to service accounts/i)) {
    return {
      what: 'Google refused because this action has to run through the server\'s robot identity (domain-wide delegation), and that is not set up or not allowed for this user.',
      cause: 'The robot key is missing, or the Admin console does not list its client ID with the right permissions.',
      todo: 'Follow DEPLOY.md Part 5 (domain-wide delegation), or run workspace_delegation_status to see which step is missing.'
    };
  }
  if (has(/unauthorized_client/i)) {
    return {
      what: 'Google rejected the server\'s robot identity.',
      cause: 'The client ID or the list of permissions in Admin console > Security > API controls > Domain-wide delegation does not exactly match what the server asks for, or the entry was saved only minutes ago (Google can take a few minutes to apply it).',
      todo: 'Compare the entry with DEPLOY.md Part 5 character by character, wait a few minutes, and try again.'
    };
  }
  if (has(/invalid_grant/i)) {
    if (/expired|revoked/i.test(message)) {
      return {
        what: 'Google no longer accepts the saved sign-in for this account.',
        cause: 'The sign-in was revoked, expired, or the account\'s password or security settings changed.',
        todo: RECONNECT
      };
    }
    if (/invalid (email|user)|account (has been )?(deleted|disabled)|no such user|subject/i.test(message)) {
      return {
        what: 'Google rejected the request to act as that user.',
        cause: 'The email address is wrong, the user does not exist on this Workspace, or the account was deleted or disabled.',
        todo: 'Check the address is a real, active user on this Workspace, then check DEPLOY.md Part 5.'
      };
    }
    return {
      what: 'Google rejected the server\'s sign-in request.',
      cause: 'The robot key may be wrong or damaged, the server\'s clock may be off, or the Admin console delegation entry does not match.',
      todo: 'Check GOOGLE_SERVICE_ACCOUNT_JSON and DEPLOY.md Part 5, and try again in a minute.'
    };
  }
  if (has(/Unauthorized operation for the given domain/i)) {
    return {
      what: 'Google would not run this action for this domain.',
      cause: 'Either the real customer ID is needed (not "my_customer") when acting as a user on a secondary domain, or the API behind this tool is not enabled on the Google Cloud project.',
      todo: 'Use the customer ID from admin_get_customer_info, and in Google Cloud Console > APIs & Services confirm the API for this tool is enabled.'
    };
  }
  if (has(/insufficientPermissions|insufficient authentication scopes|insufficient permission/i) || (status === 403 && reasonIs(/ACCESS_TOKEN_SCOPE_INSUFFICIENT/))) {
    const scopes = [...message.matchAll(/https:\/\/www\.googleapis\.com\/auth\/[\w./-]+/g)].map((m) => m[0]);
    return {
      what: 'This connection was not given permission to do that.',
      cause: scopes.length ? `The sign-in is missing: ${scopes.join(', ')}.` : 'The sign-in does not include the permission this tool needs (Google does not say which one in this error).',
      todo: `${RECONNECT} If this is a robot-identity (delegated) tool, the permission must also be added to the Admin console entry, which needs Chris's written approval first.`
    };
  }
  if (reasonIs(/^storageQuotaExceeded$/) || /storage quota/i.test(message)) {
    return {
      what: 'The Drive storage for this account is full.',
      cause: 'The account has used all of its storage, so Google will not save more files.',
      todo: 'Free up space or add storage in the Admin console, then try again. Waiting will not help.'
    };
  }
  if (status === 429 || reasonIs(/^(rateLimitExceeded|userRateLimitExceeded|quotaExceeded|dailyLimitExceeded|RESOURCE_EXHAUSTED)$/)) {
    const daily = reasonIs(/^dailyLimitExceeded$/);
    const wait = retryAfter ? `${retryAfter} seconds` : 'about a minute';
    return {
      what: 'Google is limiting how fast this account can make requests.',
      cause: daily ? 'The daily quota for this service has been used up.' : 'Too many requests in a short time.',
      todo: daily ? 'Try again tomorrow, or do less in one go.' : `Wait ${wait}, then try again.`
    };
  }
  if (status === 404 || reasonIs(/^notFound$/)) {
    return {
      what: 'Google could not find that item.',
      cause: 'The ID or address is wrong, the item was deleted, or this connection is acting as a different account from the one that owns it.',
      todo: 'Check the ID, and run workspace_whoami to confirm which account this connection acts as.'
    };
  }
  if (status === 400 || reasonIs(/^(invalid|invalidArgument|badRequest|failedPrecondition)$/) || /^Invalid (value|input|JSON)/i.test(message)) {
    const named = location || message.match(/Invalid (?:value|Input|argument)[^:]*:\s*([\w.\[\]]+)/i)?.[1] || message.match(/\\?"([\w.\[\]]+)\\?"/)?.[1];
    return {
      what: `Google did not accept one of the values sent${named ? `: "${named}"` : ''}.`,
      cause: 'A value is missing, in the wrong format, or not allowed here.',
      todo: named ? `Check "${named}" and try again.` : 'Check the values you gave (the technical detail below usually names the one that is wrong) and try again.'
    };
  }
  if (status === 401 || reasonIs(/^(invalidCredentials|authError|UNAUTHENTICATED)$/)) {
    return {
      what: 'Google no longer accepts the saved sign-in for this account.',
      cause: 'The sign-in expired or was revoked.',
      todo: RECONNECT
    };
  }
  if (status === 403 || reasonIs(/^(forbidden|PERMISSION_DENIED)$/) || /Not Authorized/i.test(message)) {
    return {
      what: 'Google said this account is not allowed to do that.',
      cause: 'The connected account may lack the needed admin role, the setting may be locked by another admin policy, or the API may not be enabled.',
      todo: 'Run workspace_whoami to confirm the account, and check it is a super admin for admin tools.'
    };
  }
  return null;
}

/** The text shown to Claude (and Chris) for a failed tool call. */
export function formatError(err) {
  const { message, details } = parts(err);
  let detailText = '';
  if (details) { try { detailText = '\nDetails: ' + JSON.stringify(details); } catch { detailText = '\nDetails: ' + String(details); } }
  const raw = `Error: ${message}${detailText}`;
  const known = explainError(err);
  if (!known) return raw;
  return `What happened: ${known.what}\nLikely cause: ${known.cause}\nWhat to do: ${known.todo}\n\nTechnical detail: ${raw}`;
}
