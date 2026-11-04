/**
 * Owner-approved exceptional same-day release procedure.
 *
 * A read-only guard for the authenticated GitHub connector release operator.
 * Does NOT modify refs, deploy, publish permissions, or authenticate the owner.
 * The ordinary scheduled promoter remains exclusively once/day and unchanged.
 *
 * Owner rule (Chris, 2026-11-04): per-day release caps bind AUTOMATIC
 * releases only. An owner-ordered release is unlimited in count: a prior
 * same-day exception receipt never blocks a further explicitly owner-approved
 * exception. Every exception still issues its own immutable receipt, prior
 * receipts are preserved untouched, and every other gate below fails closed
 * exactly as before.
 */
const SHA = /^[0-9a-f]{40}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const PREFIX = 'release-exceptions/';

export function exceptionReceipt(day, sha) {
  if (!DAY.test(day) || !SHA.test(sha)) throw Error('Invalid immutable exception receipt identity');
  return PREFIX + day + '/' + sha;
}

export function authorizeExceptionalRelease({
  explicitOwnerApproval, authenticatedOwner, day, main, live, greenExactMain,
  liveAncestorOfMain, observedReadyLiveSha, existingExceptionBranches,
  originalDailyReceiptsPreserved, currentMainAndLiveRechecked
}) {
  const receipt = exceptionReceipt(day, main);
  if (explicitOwnerApproval !== true || authenticatedOwner !== true)
    throw Error('A separate real owner authorization and authenticated connector are required');
  if (!SHA.test(live || '') || !SHA.test(observedReadyLiveSha || ''))
    throw Error('Exact live and production source identities required');
  if (!originalDailyReceiptsPreserved)
    throw Error('Existing daily release tags/branches may not be changed or deleted');
  if (!currentMainAndLiveRechecked)
    throw Error('Fresh refs and exact-head check sources must be verified immediately before release');
  if (greenExactMain !== true || liveAncestorOfMain !== true)
    throw Error('Exact-main CI and fast-forward ancestry are mandatory');
  if (observedReadyLiveSha !== live)
    throw Error('Existing production must match original live before promotion');
  if (!Array.isArray(existingExceptionBranches) ||
      existingExceptionBranches.some(x => typeof x !== 'string' || !x.startsWith(PREFIX + day + '/') ||
        !SHA.test(x.slice((PREFIX + day + '/').length))))
    throw Error('Missing or invalid complete exceptional-release receipt inventory');
  if (main === live) return { action: 'NO_CHANGE', receipt: null };
  return { action: 'LEASED_FAST_FORWARD_THEN_RECEIPT', expectedLive: live,
    checkedMain: main, receipt,
    priorExceptions: existingExceptionBranches.length,
    warning: 'Owner-approved exceptional manual release; keep daily receipts untouched. Independently verify Vercel READY/aliases after branch update.' };
}
