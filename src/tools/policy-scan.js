// Exact Cloud Identity Policy API read contract. The API returns explicit
// rules, not the reduced setting actually applied to an individual or domain.
// https://cloud.google.com/identity/docs/reference/rest/v1/policies/list
const CUSTOMER = 'customer == "customers/my_customer"';
const PAGE_LIMIT = 20;
const REQUEST_LIMIT = 100;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export function policyFilter(area) {
  if (area == null || area === 'other') return CUSTOMER;
  if (!/^[a-z][a-z_]*$/.test(area)) throw new Error('Invalid policy application.');
  // Escaped dot: a type beginning "settings/gmail." must not match "gmailX".
  return CUSTOMER + " && setting.type.matches('^settings/" + area + "\\\\..*$')";
}

export function parsePolicyPage(response) {
  const data = response?.data;
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Google Policy API did not return a valid response object; scan incomplete.');
  }
  const policies = data.policies === undefined ? [] : data.policies;
  if (!Array.isArray(policies) || policies.length > REQUEST_LIMIT) {
    throw new Error('Google Policy API returned invalid or oversized policy rows; scan incomplete.');
  }
  for (const p of policies) {
    if (!p || !/^policies\/[A-Za-z0-9_./-]+$/.test(p.name || '') ||
        !p.setting || typeof p.setting !== 'object' ||
        !/^settings\/[a-z_]+\.[A-Za-z0-9_]+$/.test(p.setting.type || '') ||
        !p.setting.value || typeof p.setting.value !== 'object' ||
        Array.isArray(p.setting.value) ||
        (p.policyQuery !== undefined && (!p.policyQuery || typeof p.policyQuery !== 'object')) ||
        (p.type !== undefined && !['ADMIN', 'SYSTEM', 'POLICY_TYPE_UNSPECIFIED'].includes(p.type))) {
      throw new Error('Google Policy API returned an invalid policy resource; scan incomplete.');
    }
  }
  // Google documents an absent OR empty cursor as the end of pagination.
  const nextPageToken = data.nextPageToken === '' ? null : (data.nextPageToken ?? null);
  if (nextPageToken !== null &&
      (typeof nextPageToken !== 'string' || !nextPageToken || nextPageToken.length > 4096)) {
    throw new Error('Google Policy API returned an invalid nextPageToken; scan incomplete.');
  }
  return { policies, nextPageToken };
}

function transient(error) {
  const code = Number(error?.response?.status ?? error?.response?.data?.error?.code ?? error?.code);
  return [429, 500, 502, 503, 504].includes(code);
}

function retryDelay(error, attempt) {
  const header = error?.response?.headers?.['retry-after'];
  // Never trust arbitrary provider error strings or unbounded Retry-After values.
  const seconds = typeof header === 'string' && /^\d{1,2}$/.test(header) ? Number(header) : 0;
  return Math.min(5000, Math.max(1100 * (attempt + 1), seconds * 1000));
}

// The wait injection belongs only to unit tests / trusted internal callers.
// It cannot change provider scopes, authorization or audit findings.
export async function readPolicyPage(clients, params, { wait = sleep } = {}) {
  if (!clients?.cloudidentity?.policies?.list) {
    throw new Error('Cloud Identity Policy API is not available to this connection.');
  }
  if (typeof params.filter !== 'string' || params.filter.length > 400 ||
      !Number.isInteger(params.pageSize) || params.pageSize < 1 ||
      params.pageSize > REQUEST_LIMIT ||
      (params.pageToken !== undefined &&
       (typeof params.pageToken !== 'string' || !params.pageToken))) {
    throw new Error('Unsafe Cloud Identity Policy API request.');
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return parsePolicyPage(await clients.cloudidentity.policies.list(params));
    } catch (error) {
      if (!transient(error) || attempt === 2) throw error;
      await wait(retryDelay(error, attempt));
    }
  }
  throw new Error('Unreachable Policy API retry state.');
}

// Deliberately bounded: a very large customer must not be reported complete
// after hitting the page cap. The continuation cursor is exposed as evidence.
export async function scanPolicyPages(clients, {
  filter = CUSTOMER, pageSize = REQUEST_LIMIT, maxPages = PAGE_LIMIT, pageToken
} = {}, { wait = sleep } = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > PAGE_LIMIT) {
    throw new Error('maxPages must be between 1 and 20.');
  }
  const policies = [];
  const names = new Map();
  const cursors = new Set();
  let token = pageToken;
  let pagesRead = 0;
  for (; pagesRead < maxPages; pagesRead++) {
    if (pagesRead > 0) await wait(1100); // Published 1 QPS per customer.
    const result = await readPolicyPage(clients, {
      filter, pageSize, ...(token ? { pageToken: token } : {})
    }, { wait });
    for (const p of result.policies) {
      const previous = names.get(p.name);
      if (previous !== undefined) {
        if (JSON.stringify(previous) !== JSON.stringify(p)) {
          throw new Error('Conflicting Policy API resource on different pages; scan incomplete.');
        }
        continue;
      }
      names.set(p.name, p);
      policies.push(p);
    }
    if (!result.nextPageToken) return {
      policies, complete: true, pagesRead: pagesRead + 1, nextPageToken: null,
      incompleteReason: null
    };
    if (cursors.has(result.nextPageToken) || result.nextPageToken === token) {
      throw new Error('Google repeated a Policy API page token; scan incomplete.');
    }
    cursors.add(result.nextPageToken);
    token = result.nextPageToken;
  }
  return {
    policies, complete: false, pagesRead, nextPageToken: token,
    incompleteReason: 'page_cap_reached'
  };
}
