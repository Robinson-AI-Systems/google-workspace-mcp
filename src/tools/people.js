import { ok } from './util.js';

const CONTACT_FIELDS = 'names,emailAddresses,phoneNumbers,organizations,addresses,birthdays,biographies,urls';

export const tools = [
  { name: 'contacts_list', description: "List contacts in the user's personal contacts", inputSchema: { type: 'object', properties: { pageSize: { type: 'number', default: 50 }, pageToken: { type: 'string' } } } },
  { name: 'contacts_search', description: 'Search personal contacts by name/email/phone', inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'contacts_get', description: 'Get one contact by resource name', inputSchema: { type: 'object', properties: { resourceName: { type: 'string', description: "e.g. 'people/c1234'" } }, required: ['resourceName'] } },
  { name: 'contacts_create', description: 'Create a new personal contact', inputSchema: { type: 'object', properties: { givenName: { type: 'string' }, familyName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' }, organization: { type: 'string' } }, required: ['givenName'] } },
  { name: 'contacts_update', description: 'Update a personal contact', inputSchema: { type: 'object', properties: { resourceName: { type: 'string' }, etag: { type: 'string' }, givenName: { type: 'string' }, familyName: { type: 'string' }, email: { type: 'string' }, phone: { type: 'string' } }, required: ['resourceName', 'etag'] } },
  { name: 'contacts_delete', description: 'Delete a personal contact', inputSchema: { type: 'object', properties: { resourceName: { type: 'string' } }, required: ['resourceName'] } },
  { name: 'contacts_list_groups', description: 'List personal contact groups/labels', inputSchema: { type: 'object', properties: {} } },
  { name: 'directory_search_people', description: "Search the Workspace domain directory for a coworker (name, email, department, title, phone)", inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] } },
  { name: 'directory_list_people', description: 'List everyone in the Workspace domain directory', inputSchema: { type: 'object', properties: { pageSize: { type: 'number', default: 100 }, pageToken: { type: 'string' } } } }
];

export const handlers = {
  contacts_list: async (args, { people }) => {
    const res = await people.people.connections.list({ resourceName: 'people/me', pageSize: args.pageSize || 50, pageToken: args.pageToken, personFields: CONTACT_FIELDS });
    return ok(res.data);
  },
  contacts_search: async (args, { people }) => {
    const res = await people.people.searchContacts({ query: args.query, readMask: CONTACT_FIELDS });
    return ok(res.data.results || []);
  },
  contacts_get: async (args, { people }) => {
    const res = await people.people.get({ resourceName: args.resourceName, personFields: CONTACT_FIELDS });
    return ok(res.data);
  },
  contacts_create: async (args, { people }) => {
    const res = await people.people.createContact({
      requestBody: {
        names: [{ givenName: args.givenName, familyName: args.familyName }],
        emailAddresses: args.email ? [{ value: args.email }] : undefined,
        phoneNumbers: args.phone ? [{ value: args.phone }] : undefined,
        organizations: args.organization ? [{ name: args.organization }] : undefined
      }
    });
    return ok(res.data);
  },
  contacts_update: async (args, { people }) => {
    const updatePersonFields = [];
    const body = { etag: args.etag };
    if (args.givenName || args.familyName) { body.names = [{ givenName: args.givenName, familyName: args.familyName }]; updatePersonFields.push('names'); }
    if (args.email) { body.emailAddresses = [{ value: args.email }]; updatePersonFields.push('emailAddresses'); }
    if (args.phone) { body.phoneNumbers = [{ value: args.phone }]; updatePersonFields.push('phoneNumbers'); }
    const res = await people.people.updateContact({ resourceName: args.resourceName, updatePersonFields: updatePersonFields.join(','), requestBody: body });
    return ok(res.data);
  },
  contacts_delete: async (args, { people }) => {
    await people.people.deleteContact({ resourceName: args.resourceName });
    return ok({ deleted: args.resourceName });
  },
  contacts_list_groups: async (_args, { people }) => {
    const res = await people.contactGroups.list({});
    return ok(res.data.contactGroups || []);
  },
  directory_search_people: async (args, { people }) => {
    const res = await people.people.searchDirectoryPeople({ query: args.query, readMask: 'names,emailAddresses,phoneNumbers,organizations', sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_CONTACT', 'DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'] });
    return ok(res.data.people || []);
  },
  directory_list_people: async (args, { people }) => {
    const res = await people.people.listDirectoryPeople({ pageSize: args.pageSize || 100, pageToken: args.pageToken, readMask: 'names,emailAddresses,phoneNumbers,organizations', sources: ['DIRECTORY_SOURCE_TYPE_DOMAIN_PROFILE'] });
    return ok(res.data);
  }
};
