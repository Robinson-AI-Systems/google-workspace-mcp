// Shared reviewed scope identifiers; no service-account loading, global
// server credential, OAuth token or delegated client can be constructed here.
export const GMAIL_SETTINGS_SCOPES=Object.freeze([
 'https://www.googleapis.com/auth/gmail.settings.basic',
 'https://www.googleapis.com/auth/gmail.settings.sharing'
]);
export const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar';
export const DRIVE_FILE_SCOPE='https://www.googleapis.com/auth/drive.file';
export const DELEGATED_SCOPES=Object.freeze([...GMAIL_SETTINGS_SCOPES,CALENDAR_SCOPE,DRIVE_FILE_SCOPE]);
// Separate opt-in scope; permits both Alert Center reads and writes.
export const ALERT_CENTER_SCOPE='https://www.googleapis.com/auth/apps.alerts';
