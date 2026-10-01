// Small helpers for email domains (used by the database layer and the domain guard).

/** Lower-case, trim, drop a leading @, remove duplicates and empties; throws on anything that is not a domain name. */
export function normalizeDomains(domains) {
  const list = [...new Set((domains || []).map((d) => String(d || '').trim().toLowerCase().replace(/^@/, '')).filter(Boolean))];
  const bad = list.find((d) => !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(d));
  if (bad) throw new Error(`"${bad}" does not look like a domain (example: robinsonaisystems.com).`);
  return list;
}

/** The part after the @ of an email address, lower-cased; '' when there is none. */
export const domainOfEmail = (email) => { const v = String(email || '').trim().toLowerCase(); const at = v.lastIndexOf('@'); return at > 0 ? v.slice(at + 1) : ''; };
