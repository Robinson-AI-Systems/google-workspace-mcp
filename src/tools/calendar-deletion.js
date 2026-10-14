import { data } from './guard-helpers.js';
import { isNotFound } from './write.js';

// A deleted secondary calendar can disappear from CalendarList before Google's
// Calendars.get metadata stops being readable. Neither an unlisted entry nor a
// successful DELETE response alone proves permanent deletion. Report both
// observations without treating a stale resource response as verified cleanup.
export async function inspectCalendarDeletion(args, { calendar }) {
  let metadata;
  try {
    metadata = await data(calendar.calendars.get({ calendarId: args.calendarId }));
  } catch (error) {
    if (isNotFound(error)) return { exists: false, verification: 'calendar_not_found' };
    throw error;
  }
  if (metadata?.deleted === true && metadata?.id === args.calendarId) {
    return { exists: false, verification: 'calendar_deleted_marker' };
  }

  let listed = null;
  try {
    const entry = await data(calendar.calendarList.get({ calendarId: args.calendarId }));
    if (entry?.id === args.calendarId) listed = entry.deleted === true ? false : true;
  } catch (error) {
    if (isNotFound(error)) listed = false;
    // A denied or transient list read is not evidence of absence.
  }

  const metadataReadable = metadata?.id === args.calendarId;
  const verification = metadataReadable && listed === true
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
      : 'Google has not independently confirmed permanent deletion of this calendar.'
  };
}

