import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeFakeClients } from '../helpers/fake-google.js';
import { createFakeDb } from '../helpers/fake-db.js';

const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async (importActual) => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map((name) => [name, (...args) => holder.db[name](...args)]));
});
const { registry } = await import('../../src/tools/index.js');
const { domainsTargeted, outsideDomains } = await import('../../src/tools/domain-guard.js');
const { handlers: accounts } = await import('../../src/tools/accounts.js');

const body = (r) => JSON.parse(r.content[0].text);
const text = (r) => r.content[0].text;
const mutations = (calls) => calls.filter((c) => !/\.(get|list|search)[A-Za-z]*$/.test(c.path));
// A connection acting as the rentals mailbox, allowed to manage only rentals.test
const rentals = () => { const f = makeFakeClients({ actingAs: 'ops@rentals.test' }); f.clients.allowedDomains = ['rentals.test']; return f; };

beforeEach(async () => {
  holder.db = createFakeDb();
  await holder.db.saveGoogleTokensFor('ops@rentals.test', { access_token: 'a' });
  await holder.db.saveGoogleTokensFor('ops@ai-systems.test', { access_token: 'b' });
});

describe('what the guard looks at', () => {
  it('finds domains in emails, lists and domain names, and ignores IDs, "me" and "all"', () => {
    expect(domainsTargeted({ userKey: 'Sam@Ai-Systems.test', groupEmails: ['a@x.test', 'b@y.test'], domainName: 'Z.test' }).map((t) => t.domain)).toEqual(['ai-systems.test', 'x.test', 'y.test', 'z.test']);
    expect(domainsTargeted({ userKey: '1234567890', userId: 'me', groupKey: 'all' })).toEqual([]);
  });
  it('compares the whole domain, so a look-alike or a subdomain is outside', () => {
    expect(outsideDomains({ userKey: 'a@rentals.test' }, ['rentals.test'])).toEqual([]);
    expect(outsideDomains({ userKey: 'a@rentals.test.evil.test' }, ['rentals.test'])).toHaveLength(1);
    expect(outsideDomains({ userKey: 'a@sub.rentals.test' }, ['rentals.test'])).toHaveLength(1);
    expect(outsideDomains({ userKey: 'a@RENTALS.test' }, ['Rentals.test'])).toEqual([]);
  });
});

describe('the admin tools, called from the rentals connection', () => {
  it('admin_get_user for someone at another business is refused in plain words, with no call to Google', async () => {
    const { clients, calls } = rentals();
    const out = text(await registry.handlers.admin_get_user({ userKey: 'sam@ai-systems.test' }, clients));
    expect(out).toMatch(/^Refused: sam@ai-systems\.test/);
    expect(out).toMatch(/limited to rentals\.test/);
    expect(out).toMatch(/crossDomain: true/);
    expect(calls).toEqual([]);
  });
  it('works for its own domain', async () => {
    const { clients, calls, when } = rentals();
    when('admin.users.get').resolves({ data: { primaryEmail: 'kim@rentals.test' } });
    expect(JSON.parse(text(await registry.handlers.admin_get_user({ userKey: 'kim@rentals.test' }, clients)))).toMatchObject({ primaryEmail: 'kim@rentals.test' });
    expect(calls.length).toBeGreaterThan(0);
  });
  it('works across businesses with crossDomain: true, and Google never sees that flag', async () => {
    const { clients, calls, when } = rentals();
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@ai-systems.test' } });
    await registry.handlers.admin_get_user({ userKey: 'sam@ai-systems.test', crossDomain: true }, clients);
    expect(JSON.stringify(calls)).not.toMatch(/crossDomain/);
    expect(calls.length).toBeGreaterThan(0);
  });
  it('risky changes are refused before anything happens, including previews and unconfirmed calls (nothing leaks)', async () => {
    const { clients, calls } = rentals();
    for (const [name, args] of [['admin_delete_user', { userKey: 'sam@ai-systems.test', confirm: true }], ['admin_suspend_user', { userKey: 'sam@ai-systems.test', dryRun: true }], ['admin_delete_group', { groupKey: 'team@ai-systems.test', confirm: true }], ['admin_delete_domain', { domainName: 'ai-systems.test', confirm: true }], ['admin_add_group_member', { groupKey: 'team@rentals.test', memberEmail: 'sam@ai-systems.test', role: 'MEMBER' }], ['workflow_offboard_employee', { userKey: 'sam@ai-systems.test', confirm: true }], ['licensing_remove_license', { userId: 'sam@ai-systems.test', skuId: 's', confirm: true }]]) {
      expect(text(await registry.handlers[name](args, clients)), name).toMatch(/^Refused/);
    }
    expect(calls).toEqual([]);
    expect(await holder.db.listRecentChanges()).toEqual([]);
  });
  it('a second target outside the list (the group is fine, the member is not) is still caught', async () => {
    const { clients } = rentals();
    expect(text(await registry.handlers.admin_add_group_member({ groupKey: 'team@rentals.test', memberEmail: 'x@elsewhere.test', role: 'MEMBER' }, clients))).toMatch(/^Refused: x@elsewhere\.test/);
  });
  it('every admin-style tool advertises crossDomain and mentions the limit', () => {
    const t = registry.tools.find((x) => x.name === 'admin_get_user');
    expect(t.inputSchema.properties.crossDomain.type).toBe('boolean');
    expect(t.description).toMatch(/crossDomain/);
    expect(registry.tools.find((x) => x.name === 'gmail_search').inputSchema.properties.crossDomain).toBeUndefined();
  });
  it('a connection with no limit configured is unrestricted', async () => {
    const { clients, when } = makeFakeClients({ actingAs: 'ops@rentals.test' });
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@ai-systems.test' } });
    expect(text(await registry.handlers.admin_get_user({ userKey: 'sam@ai-systems.test' }, clients))).not.toMatch(/Refused/);
  });
});

describe('cross-business Reports privacy', () => {
  it('refuses organization-wide and opaque-ID Reports reads from a restricted business before Google is called', async () => {
    const { clients, calls } = rentals();
    const cases = [
      ['reports_activity', { application:'login' }],
      ['reports_activity', { application:'admin', userKey:'all' }],
      ['reports_activity', { application:'drive', userKey:'user-id-without-domain' }],
      ['reports_login_activity', {}],
      ['reports_admin_activity', {userKey:'all'}],
      ['reports_usage_customer', {date:'2026-10-10'}],
      ['reports_usage_user', {userKey:'12345678',date:'2026-10-10'}]
    ];
    for(const [name,args] of cases) {
      const out=text(await registry.handlers[name](args,clients));
      expect(out,name).toMatch(/^Refused: This Reports request/);
      expect(out,name).toContain('Nothing was read.');
    }
    expect(calls).toEqual([]);
  });
  it('allows exact own-domain Reports reads and explicit owner-authorized customer-wide reads without leaking crossDomain to Google', async () => {
    const { clients,calls }=rentals();
    const own=body(await registry.handlers.reports_activity({application:'login',userKey:'ops@rentals.test'},clients));
    expect(own.application).toBe('login');
    expect(calls.some(c=>c.path==='adminReports.activities.list')).toBe(true);
    expect(calls.at(-1).args[0].userKey).toBe('ops@rentals.test');
    await registry.handlers.reports_activity({application:'login',userKey:'all',crossDomain:true},clients);
    expect(calls.at(-1).args[0].userKey).toBe('all');
    await registry.handlers.reports_usage_customer({date:'2026-10-10',crossDomain:true},clients);
    expect(calls.at(-1).path).toBe('adminReports.customerUsageReports.get');
    expect(JSON.stringify(calls)).not.toContain('crossDomain');
  });
  it('does not impose domain limits on connections that have no allowed-domains restriction',async()=>{
    const {clients,calls}=makeFakeClients({actingAs:'ops@rentals.test'});
    await registry.handlers.reports_activity({application:'login'},clients);
    expect(calls.some(c=>c.path==='adminReports.activities.list')).toBe(true);
  });
});

describe('workspace_set_allowed_domains', () => {
  it('changes nothing without confirm, and says what it would do', async () => {
    const out = body(await accounts.workspace_set_allowed_domains({ email: 'ops@rentals.test', domains: ['rentals.test', 'ai-systems.test'] }, rentals().clients));
    expect(out).toMatchObject({ done: false, needsConfirmation: true, allowedNow: ['rentals.test'] });
    expect(await holder.db.getAllowedDomains('ops@rentals.test')).toEqual(['rentals.test']);
  });
  it('with confirm it widens the limit, logs it, and the guard then lets the other domain through', async () => {
    const { clients, when } = rentals();
    const out = body(await accounts.workspace_set_allowed_domains({ email: 'ops@rentals.test', domains: ['rentals.test', 'ai-systems.test'], confirm: true }, clients));
    expect(out).toMatchObject({ done: true, allowedDomains: ['rentals.test', 'ai-systems.test'], logged: true });
    expect((await holder.db.listRecentChanges())[0]).toMatchObject({ tool: 'workspace_set_allowed_domains', before: { allowedDomains: ['rentals.test'] }, after: { allowedDomains: ['rentals.test', 'ai-systems.test'] } });
    clients.allowedDomains = await holder.db.getAllowedDomains('ops@rentals.test'); // what api/mcp.js does on every call
    when('admin.users.get').resolves({ data: { primaryEmail: 'sam@ai-systems.test' } });
    expect(text(await registry.handlers.admin_get_user({ userKey: 'sam@ai-systems.test' }, clients))).not.toMatch(/Refused/);
  });
  it('rejects things that are not domains before asking for confirmation', async () => {
    await expect(accounts.workspace_set_allowed_domains({ email: 'ops@rentals.test', domains: ['nope nope'] }, rentals().clients)).rejects.toThrow(/does not look like a domain/);
  });
  it('workspace_list_accounts shows the limit in force', async () => {
    const list = body(await accounts.workspace_list_accounts());
    expect(list.find((a) => a.email === 'ops@rentals.test')).toMatchObject({ allowed_domains: ['rentals.test'], allowed_domains_custom: false });
  });
});


describe('P7-1 shared-drive and existing Drive member caller authorization', () => {
 it('declares crossDomain only on the mutating sharing tool, never on ordinary file reads', () => {
   const t=registry.tools.find(x=>x.name==='drive_share_file');
   expect(t.inputSchema.properties.crossDomain.type).toBe('boolean');
   expect(registry.tools.find(x=>x.name==='drive_list_files').inputSchema.properties.crossDomain).toBeUndefined();
 });
 it('refuses outside-domain member creation without crossDomain even when confirm is set',async()=>{
   for(const extra of [{},{dryRun:true},{confirm:true}]){
     const f=rentals();
     const result=text(await registry.handlers.drive_share_file({
       fileId:'shared1',role:'writer',type:'user',
       emailAddress:'outsider@elsewhere.test',...extra},f.clients));
     expect(result).toMatch(/Refused/);
     expect(f.calls).toHaveLength(0);
   }
 });
 it('does not let crossDomain alone bypass independent owner confirmation',async()=>{
   const f=rentals();
   const out=body(await registry.handlers.drive_share_file({
     fileId:'shared1',role:'writer',type:'user',
     emailAddress:'outsider@elsewhere.test',crossDomain:true},f.clients));
   expect(out).toMatchObject({done:false,needsConfirmation:true});
   expect(f.calls.some(c=>c.path==='drive.permissions.create')).toBe(false);
   expect(JSON.stringify(f.calls)).not.toContain('crossDomain');
 });
 it('permits an expressly approved external shared member and confirms the Google result',async()=>{
   const f=rentals();
   f.when('drive.permissions.create').resolves({data:{
     id:'permission1',role:'writer',type:'user',emailAddress:'outsider@elsewhere.test'}});
   f.when('drive.permissions.get').resolves({data:{
     id:'permission1',role:'writer',type:'user',emailAddress:'outsider@elsewhere.test'}});
   const out=body(await registry.handlers.drive_share_file({
     fileId:'shared1',role:'writer',type:'user',emailAddress:'outsider@elsewhere.test',
     crossDomain:true,confirm:true},f.clients));
   expect(out).toMatchObject({done:true});
   expect(f.calls.filter(c=>c.path==='drive.permissions.create')).toHaveLength(1);
   expect(JSON.stringify(f.calls)).not.toContain('crossDomain');
 });
 it('ordinary allowed-domain member shares remain compatible',async()=>{
   const f=rentals();
   f.when('drive.permissions.create').resolves({data:{id:'permission2',role:'writer',
     emailAddress:'member@rentals.test'}});
   f.when('drive.permissions.get').resolves({data:{id:'permission2',role:'writer',
     emailAddress:'member@rentals.test'}});
   const out=body(await registry.handlers.drive_share_file({
     fileId:'shared1',role:'writer',type:'user',emailAddress:'member@rentals.test'},f.clients));
   expect(out).toMatchObject({done:true});
   expect(f.calls.filter(c=>c.path==='drive.permissions.create')).toHaveLength(1);
 });
 it('promoting new members to organizer and creating public/domain links requires confirmation',async()=>{
   for(const args of [
     {role:'organizer',type:'user',emailAddress:'member@rentals.test'},
     {role:'reader',type:'anyone'},
     {role:'reader',type:'domain',emailAddress:'member@rentals.test',crossDomain:true}
   ]) {
     const f=rentals();
     const out=body(await registry.handlers.drive_share_file({
       fileId:'shared1',...args},f.clients));
     expect(out.needsConfirmation).toBe(true);
     expect(f.calls.filter(c=>c.path==='drive.permissions.create')).toHaveLength(0);
   }
 });
});

describe('P10 live customer-domain list and field-projection regressions',()=>{
 it('defaults allowed-domain Directory group and user lists to the principal domain, not my_customer',async()=>{
   const {clients,calls}=rentals();
   const groups=await registry.handlers.admin_list_groups({},clients);
   const users=await registry.handlers.admin_list_users({},clients);
   expect(groups.isError).not.toBe(true);
   expect(users.isError).not.toBe(true);
   expect(calls.find(x=>x.path==='admin.groups.list')?.args?.[0])
     .toMatchObject({domain:'rentals.test'});
   expect(calls.find(x=>x.path==='admin.users.list')?.args?.[0])
     .toMatchObject({domain:'rentals.test'});
   expect(calls.filter(x=>x.path==='admin.groups.list'||x.path==='admin.users.list')
     .every(x=>x.args[0].customer===undefined)).toBe(true);
 });
 it('does not silently accept other-domain list requests; explicit opt-in retains real customer-wide reads',async()=>{
   const {clients,calls}=rentals();
   const denied=await registry.handlers.admin_list_groups({domain:'ai-systems.test'},clients);
   expect(text(denied)).toMatch(/^Refused:/);
   expect(calls).toHaveLength(0);
   const opted=await registry.handlers.admin_list_groups({crossDomain:true},clients);
   expect(opted.isError).not.toBe(true);
   const query=calls.find(x=>x.path==='admin.groups.list');
   expect(query.args[0]).toMatchObject({customer:'my_customer'});
   expect(query.args[0].domain).toBeUndefined();
   expect(JSON.stringify(calls)).not.toContain('crossDomain');
 });
 it('refuses unfilterable customer-wide Admin info, but supports explicit cross-domain owner choice',async()=>{
   const {clients,calls}=rentals();
   const blocked=await registry.handlers.admin_get_customer_info({},clients);
   expect(text(blocked)).toMatch(/^Refused:/);
   expect(calls).toHaveLength(0);
   const filtered=await registry.handlers.admin_get_customer_info({fields:'customerDomain'},clients);
   expect(filtered.isError).toBe(true);
   expect(text(filtered)).toMatch(/^Refused:/);
   expect(text(filtered)).not.toBe('{}');
   expect(calls).toHaveLength(0);
   await registry.handlers.admin_get_customer_info({crossDomain:true},clients);
   expect(calls.find(c=>c.path==='admin.customers.get')).toBeTruthy();
 });
 it('returns a visible refusal, not {} success, when fields filter targets a blocked foreign group',async()=>{
   const {clients,calls}=rentals();
   const denied=await registry.handlers.admin_get_group_settings({
     groupEmail:'other@ai-systems.test',fields:'whoCanPostMessage'},clients);
   expect(denied.isError).toBe(true);
   expect(text(denied)).toMatch(/^Refused:/);
   expect(text(denied)).not.toBe('{}');
   expect(calls).toHaveLength(0);
 });
});
