import { data } from './guard-helpers.js';
import { isNotFound } from './write.js';

// Permanent calendar deletion is only confirmed when the exact resource and
// account-list observations agree. The two Google endpoints can converge at
// different times, and a forbidden or malformed read is never proof of absence.
// This helper is shared by the guarded delete readback and a read-only verifier;
// it must never issue a mutating request or retry DELETE.
export async function inspectCalendarDeletion(args, { calendar }) {
  const id = args.calendarId;
  let metadata;
  let resourceNotFound = false;
  try {
    metadata = await data(calendar.calendars.get({ calendarId: id }));
  } catch (error) {
    if (!isNotFound(error)) throw error;
    resourceNotFound = true;
  }

  let listed = null;
  try {
    const entry = await data(calendar.calendarList.get({ calendarId: id }));
    if (entry?.id === id) listed = entry.deleted === true ? false : true;
    // A successful response for a different ID (or missing ID) proves nothing.
  } catch (error) {
    if (isNotFound(error)) listed = false;
    // A denied or transient list read cannot confirm either presence or absence.
  }

  const metadataReadable = !resourceNotFound && metadata?.id === id;
  const deletedMarker = metadataReadable && metadata.deleted === true;

  if (listed === false && (resourceNotFound || deletedMarker)) {
    return {
      exists: false,
      verification: resourceNotFound ? 'calendar_not_found' : 'calendar_deleted_marker',
      listed: false,
      metadataReadable
    };
  }

  const verification = resourceNotFound && listed === true
    ? 'not_found_but_listed'
    : deletedMarker && listed === true
      ? 'deleted_marker_still_listed'
      : metadataReadable && listed === true
        ? 'still_listed'
        : metadataReadable && listed === false
          ? 'not_listed_metadata_readable'
          : 'inconclusive';

  return {
    exists: verification === 'still_listed' ? true : null,
    verification,
    listed,
    metadataReadable,
    note: verification === 'not_listed_metadata_readable'
      ? 'This calendar is absent from the account list, but Google still returns its metadata. Permanent deletion has not yet been verified; check the exact ID again later.'
      : verification === 'not_found_but_listed' || verification === 'deleted_marker_still_listed'
        ? 'The calendar resource looks deleted, but its exact account-list entry remains visible. Cleanup is not confirmed; recheck later without deleting again.'
        : 'Google has not independently confirmed permanent deletion of this calendar.'
  };
}
