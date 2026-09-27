import { ok } from './util.js';

export const tools = [
  { name: 'chat_list_spaces', description: 'List Google Chat spaces (rooms/DMs) this account is in', inputSchema: { type: 'object', properties: {} } },
  { name: 'chat_get_space', description: 'Get one Chat space', inputSchema: { type: 'object', properties: { spaceName: { type: 'string', description: "e.g. 'spaces/AAAA1234'" } }, required: ['spaceName'] } },
  { name: 'chat_create_space', description: 'Create a new named Chat space', inputSchema: { type: 'object', properties: { displayName: { type: 'string' } }, required: ['displayName'] } },
  { name: 'chat_list_members', description: 'List members of a Chat space', inputSchema: { type: 'object', properties: { spaceName: { type: 'string' } }, required: ['spaceName'] } },
  { name: 'chat_add_member', description: 'Add a member to a Chat space', inputSchema: { type: 'object', properties: { spaceName: { type: 'string' }, memberEmail: { type: 'string' } }, required: ['spaceName', 'memberEmail'] } },
  { name: 'chat_send_message', description: 'Send a message to a Chat space', inputSchema: { type: 'object', properties: { spaceName: { type: 'string' }, text: { type: 'string' } }, required: ['spaceName', 'text'] } },
  { name: 'chat_list_messages', description: 'List recent messages in a Chat space', inputSchema: { type: 'object', properties: { spaceName: { type: 'string' }, pageSize: { type: 'number', default: 25 } }, required: ['spaceName'] } },
  { name: 'chat_delete_message', description: 'Delete a message from a Chat space', inputSchema: { type: 'object', properties: { messageName: { type: 'string' } }, required: ['messageName'] } }
];

export const handlers = {
  chat_list_spaces: async (_args, { chat }) => {
    const res = await chat.spaces.list({});
    return ok(res.data.spaces || []);
  },
  chat_get_space: async (args, { chat }) => {
    const res = await chat.spaces.get({ name: args.spaceName });
    return ok(res.data);
  },
  chat_create_space: async (args, { chat }) => {
    const res = await chat.spaces.create({ requestBody: { displayName: args.displayName, spaceType: 'SPACE' } });
    return ok(res.data);
  },
  chat_list_members: async (args, { chat }) => {
    const res = await chat.spaces.members.list({ parent: args.spaceName });
    return ok(res.data.memberships || []);
  },
  chat_add_member: async (args, { chat }) => {
    const res = await chat.spaces.members.create({ parent: args.spaceName, requestBody: { member: { name: `users/${args.memberEmail}`, type: 'HUMAN' } } });
    return ok(res.data);
  },
  chat_send_message: async (args, { chat }) => {
    const res = await chat.spaces.messages.create({ parent: args.spaceName, requestBody: { text: args.text } });
    return ok(res.data);
  },
  chat_list_messages: async (args, { chat }) => {
    const res = await chat.spaces.messages.list({ parent: args.spaceName, pageSize: args.pageSize || 25 });
    return ok(res.data.messages || []);
  },
  chat_delete_message: async (args, { chat }) => {
    await chat.spaces.messages.delete({ name: args.messageName });
    return ok({ deleted: args.messageName });
  }
};
