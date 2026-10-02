import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { buildSettingsBody, SETTING_KEYS, CHOICE_FIELDS, BOOLEAN_FIELDS, TEXT_FIELDS } = await import('../../src/tools/group-settings.js');

const body = (r) => JSON.parse(r.content[0].text);
const run = (args, clients) => registry.handlers.admin_update_group_settings(args, clients);
const patches = (calls) => calls.filter((c) => c.path === 'groupssettings.groups.patch');
const anyGroupCall = (calls) => calls.filter((c) => c.path.startsWith('groupssettings.groups.patch'));
const GROUP = 'support@example.test';

// One safe value for every setting added by P6-1 (none of them needs confirm).
const NEW_SAFE = {
  replyTo: 'REPLY_TO_CUSTOM',
  customReplyTo: 'helpdesk@example.test',
  messageModerationLevel: 'MODERATE_NON_MEMBERS',
  spamModerationLevel: 'MODERATE',
  whoCanModerateContent: 'OWNERS_AND_MANAGERS',
  whoCanModerateMembers: 'OWNERS_ONLY',
  whoCanContactOwner: 'ALL_IN_DOMAIN_CAN_CONTACT',
  whoCanDiscoverGroup: 'ALL_IN_DOMAIN_CAN_DISCOVER',
  allowWebPosting: true,
  membersCanPostAsTheGroup: false,
  enableCollaborativeInbox: true,
  includeInGlobalAddressList: true,
  sendMessageDenyNotification: true,
  defaultMessageDenyNotificationText: 'Sorry, your message was not approved.',
  includeCustomFooter: true,
  customFooterText: 'Robinson Appliance Rentals'
};
const stringified = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, typeof v === 'boolean' ? String(v) : v]));

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@example.test', { access_token: 'a' });
});

describe('group settings: the checking and request body', () => {
  it('knows every setting: the original six and the sixteen newer ones, and not the deprecated showInGroupDirectory', () => {
    for (const k of ['whoCanJoin', 'whoCanPostMessage', 'whoCanViewMembership', 'whoCanViewGroup', 'allowExternalMembers', 'isArchived']) expect(SETTING_KEYS).toContain(k);
    for (const k of Object.keys(NEW_SAFE)) expect(SETTING_KEYS, k).toContain(k);
    expect(SETTING_KEYS.length).toBe(6 + Object.keys(NEW_SAFE).length);
    expect(SETTING_KEYS).not.toContain('showInGroupDirectory');
    expect(Object.keys(CHOICE_FIELDS).length + BOOLEAN_FIELDS.length + Object.keys(TEXT_FIELDS).length).toBe(Object.keys(NEW_SAFE).length);
  });

  it('passes the original six through exactly as before (text unchecked, booleans as the words true/false)', () => {
    expect(buildSettingsBody({ groupEmail: GROUP, whoCanJoin: 'INVITED_CAN_JOIN', whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST', whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW', whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW', allowExternalMembers: false, isArchived: true }))
      .toEqual({ whoCanJoin: 'INVITED_CAN_JOIN', whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST', whoCanViewMembership: 'ALL_MANAGERS_CAN_VIEW', whoCanViewGroup: 'ALL_MEMBERS_CAN_VIEW', allowExternalMembers: 'false', isArchived: 'true' });
    expect(buildSettingsBody({ groupEmail: GROUP, whoCanJoin: 'SOME_NEW_GOOGLE_VALUE' })).toEqual({ whoCanJoin: 'SOME_NEW_GOOGLE_VALUE' });
  });

  it('turns every new setting into the request body, with booleans as the words true/false', () => {
    expect(buildSettingsBody({ groupEmail: GROUP, ...NEW_SAFE })).toEqual(stringified(NEW_SAFE));
  });

  it('accepts a choice in any letter case and sends it in capitals', () => {
    expect(buildSettingsBody({ replyTo: 'reply_to_sender', spamModerationLevel: ' Moderate ' })).toEqual({ replyTo: 'REPLY_TO_SENDER', spamModerationLevel: 'MODERATE' });
  });

  it('accepts "true"/"false" words for the on/off settings', () => {
    expect(buildSettingsBody({ allowWebPosting: 'TRUE', includeCustomFooter: 'false' })).toEqual({ allowWebPosting: 'true', includeCustomFooter: 'false' });
  });

  it('treats nothing, null and empty text as "not given", and ignores settings it does not know', () => {
    expect(buildSettingsBody({ groupEmail: GROUP, replyTo: '', customFooterText: '', allowWebPosting: null, showInGroupDirectory: true, somethingElse: 'x' })).toEqual({});
  });

  it('refuses a value Google does not accept with one plain message that lists every problem and every allowed value', () => {
    let message = '';
    try { buildSettingsBody({ replyTo: 'REPLY_TO_NOBODY', spamModerationLevel: 'maybe', allowWebPosting: 'yes', customReplyTo: 'not an address' }); } catch (e) { message = e.message; }
    expect(message).toContain('"REPLY_TO_NOBODY" is not a valid replyTo');
    expect(message).toContain(CHOICE_FIELDS.replyTo.join(', '));
    expect(message).toContain('"maybe" is not a valid spamModerationLevel');
    expect(message).toContain(CHOICE_FIELDS.spamModerationLevel.join(', '));
    expect(message).toContain('allowWebPosting must be true or false');
    expect(message).toContain('customReplyTo must be one email address');
    expect(message).toContain('Nothing was changed.');
  });

  it('refuses text longer than Google allows', () => {
    expect(() => buildSettingsBody({ customFooterText: 'x'.repeat(1001) })).toThrow(/customFooterText is 1001 characters long; Google allows at most 1000/);
    expect(() => buildSettingsBody({ defaultMessageDenyNotificationText: 'x'.repeat(10001) })).toThrow(/at most 10000/);
    expect(buildSettingsBody({ customFooterText: 'x'.repeat(1000) }).customFooterText.length).toBe(1000);
  });
});

describe('admin_update_group_settings through the safety layer', () => {
  const fresh = (held = {}) => { const x = makeFakeClients(); x.when('groupssettings.groups.get').resolves({ data: held }); return x; };

  it('sends every new setting to Google and returns what Google holds afterwards, confirmed', async () => {
    const x = fresh(stringified(NEW_SAFE));
    const out = body(await run({ groupEmail: GROUP, ...NEW_SAFE }, x.clients));
    expect(patches(x.calls)).toHaveLength(1);
    expect(patches(x.calls)[0].args[0]).toMatchObject({ groupUniqueId: GROUP, requestBody: stringified(NEW_SAFE) });
    expect(out).toMatchObject({ done: true, confirmed: true });
    expect(out.after).toMatchObject(stringified(NEW_SAFE)); // the read-back shows the new settings, not just the old six
  });

  it('keeps the original settings working: same request, same read-back, no confirm for a safe change', async () => {
    const x = fresh({ whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST', allowExternalMembers: 'false' });
    const out = body(await run({ groupEmail: GROUP, whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST', allowExternalMembers: false }, x.clients));
    expect(patches(x.calls)[0].args[0].requestBody).toEqual({ whoCanPostMessage: 'ALL_IN_DOMAIN_CAN_POST', allowExternalMembers: 'false' });
    expect(out).toMatchObject({ done: true, confirmed: true });
  });

  it('says it is not confirmed when Google still shows the old value', async () => {
    const x = fresh({ replyTo: 'REPLY_TO_LIST' });
    const out = body(await run({ groupEmail: GROUP, replyTo: 'REPLY_TO_SENDER' }, x.clients));
    expect(out).toMatchObject({ done: true, confirmed: false });
    expect(out.warning).toMatch(/does not show the result that was asked for/);
  });

  it('checks the read-back for every setting that was asked for, not just some', async () => {
    const held = stringified(NEW_SAFE);
    held.customFooterText = 'something else';
    const x = fresh(held);
    expect(body(await run({ groupEmail: GROUP, ...NEW_SAFE }, x.clients)).confirmed).toBe(false);
  });

  it('a preview changes nothing and says what would change', async () => {
    const x = fresh({});
    const out = body(await run({ groupEmail: GROUP, replyTo: 'REPLY_TO_SENDER', messageModerationLevel: 'MODERATE_ALL_MESSAGES', dryRun: true }, x.clients));
    expect(out).toMatchObject({ done: false, dryRun: true });
    expect(out.summary).toContain('replyTo = REPLY_TO_SENDER');
    expect(out.summary).toContain('messageModerationLevel = MODERATE_ALL_MESSAGES');
    expect(anyGroupCall(x.calls)).toEqual([]);
  });

  it('refuses a bad value, in a preview too, before anything is read or changed', async () => {
    for (const extra of [{}, { dryRun: true }]) {
      const x = fresh({});
      await expect(run({ groupEmail: GROUP, replyTo: 'NOWHERE', ...extra }, x.clients)).rejects.toThrow(/not a valid replyTo.*Allowed values: REPLY_TO_CUSTOM/);
      expect(x.calls).toEqual([]);
    }
  });

  it('needs confirm to switch message approval off, however the value is spelled, and then goes ahead', async () => {
    for (const value of ['MODERATE_NONE', 'moderate_none']) {
      const x = fresh({ messageModerationLevel: 'MODERATE_NONE' });
      const out = body(await run({ groupEmail: GROUP, messageModerationLevel: value }, x.clients));
      expect(out, value).toMatchObject({ done: false, needsConfirmation: true });
      expect(anyGroupCall(x.calls), value).toEqual([]);
    }
    const y = fresh({ messageModerationLevel: 'MODERATE_NONE' });
    const done = body(await run({ groupEmail: GROUP, messageModerationLevel: 'moderate_none', confirm: true }, y.clients));
    expect(done).toMatchObject({ done: true, confirmed: true });
    expect(patches(y.calls)[0].args[0].requestBody).toEqual({ messageModerationLevel: 'MODERATE_NONE' });
  });

  it('needs confirm to let spam straight through, and then goes ahead', async () => {
    const x = fresh({ spamModerationLevel: 'ALLOW' });
    expect(body(await run({ groupEmail: GROUP, spamModerationLevel: 'ALLOW' }, x.clients))).toMatchObject({ done: false, needsConfirmation: true });
    expect(anyGroupCall(x.calls)).toEqual([]);
    expect(body(await run({ groupEmail: GROUP, spamModerationLevel: 'ALLOW', confirm: true }, x.clients))).toMatchObject({ done: true, confirmed: true });
  });

  it('does not ask for confirm for the safe moderation settings', async () => {
    const x = fresh({ messageModerationLevel: 'MODERATE_ALL_MESSAGES', spamModerationLevel: 'REJECT' });
    expect(body(await run({ groupEmail: GROUP, messageModerationLevel: 'MODERATE_ALL_MESSAGES', spamModerationLevel: 'REJECT' }, x.clients))).toMatchObject({ done: true, confirmed: true });
  });

  it('still needs confirm for the cases it already protected (outsiders and the whole internet)', async () => {
    for (const extra of [{ allowExternalMembers: true }, { whoCanJoin: 'ANYONE_CAN_JOIN' }, { whoCanPostMessage: 'ANYONE_CAN_POST' }, { whoCanViewGroup: 'ANYONE_CAN_VIEW' }]) {
      const x = fresh({});
      expect(body(await run({ groupEmail: GROUP, ...extra }, x.clients)), JSON.stringify(extra)).toMatchObject({ needsConfirmation: true });
      expect(anyGroupCall(x.calls)).toEqual([]);
    }
  });

  it('a long footer is shortened in the preview text but sent whole', async () => {
    const footer = 'F'.repeat(900);
    const x = fresh({ customFooterText: footer });
    const out = body(await run({ groupEmail: GROUP, customFooterText: footer, dryRun: true }, x.clients));
    expect(out.summary.length).toBeLessThan(250);
    expect(out.summary).toContain('...');
    const done = body(await run({ groupEmail: GROUP, customFooterText: footer }, x.clients));
    expect(patches(x.calls)[0].args[0].requestBody.customFooterText).toBe(footer);
    expect(done.confirmed).toBe(true);
  });

  it('advertises the new settings, with the allowed values, in the tool list Claude sees', () => {
    const tool = registry.tools.find((t) => t.name === 'admin_update_group_settings');
    for (const k of Object.keys(NEW_SAFE)) expect(tool.inputSchema.properties[k], k).toBeTruthy();
    expect(tool.inputSchema.properties.replyTo.enum).toEqual(CHOICE_FIELDS.replyTo);
    expect(tool.inputSchema.properties.dryRun.type).toBe('boolean');
    expect(tool.inputSchema.properties.confirm.type).toBe('boolean');
    expect(tool.inputSchema.required).toEqual(['groupEmail']);
  });
});
