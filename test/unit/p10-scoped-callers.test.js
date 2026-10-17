import {describe,it,expect,vi} from 'vitest';
import {buildApiClients} from '../../src/auth/google-auth-hosted.js';
import {handlers as accountHandlers} from '../../src/tools/accounts.js';
import {handlers as metaHandlers} from '../../src/tools/rtc-meta.js';
import {scopedDelegationClients} from '../../src/principals/delegation.js';
import {prepareUndo} from '../../src/tools/undo.js';

const unpack=result=>JSON.parse(result.content[0].text);
describe('P10 explicit caller injection: independent tenant cannot discover owner fallback',()=>{
 it('constructs a tenant API client with an explicit missing-delegation fence',()=>{
  const auth={actingAs:'a@example.test'};
  const delegation=scopedDelegationClients(null);
  const clients=buildApiClients(auth,{tenantDelegation:delegation});
  expect(clients.actingAs).toBe('a@example.test');
  expect(clients.delegationReady).toBe(false);
  expect(()=>clients.gmailFor('owner@example.test')).toThrow('customer_delegation_not_configured');
  expect(()=>clients.delegatedClientsFor('owner@example.test',[])).toThrow('customer_delegation_not_configured');
  expect(()=>clients.alertcenter).toThrow('customer_delegation_not_configured');
 });
 it('rejects wrong customer, subject and scope before constructing a delegated provider',()=>{
  const delegated=scopedDelegationClients({
   customerId:'C12345678',subject:'a@example.test',
   scopes:['https://www.googleapis.com/auth/gmail.settings.basic'],
   key:{client_email:'robot@testing.iam.gserviceaccount.com',private_key:'invalid_not_used'}
  });
  expect(()=>delegated.forGmail('b@example.test')).toThrow('customer_subject_not_verified');
  expect(()=>delegated.forGmail('a@example.test')).toThrow('customer_delegation_scope_missing');
  expect(()=>delegated.forServices('a@example.test',[
   'https://www.googleapis.com/auth/calendar'
  ])).toThrow('customer_delegation_scope_missing');
  expect(()=>delegated.forAlert('a@example.test')).toThrow('customer_delegation_scope_missing');
 });
 it('uses scoped principal account/default/connection/history handlers, never global inventory',async()=>{
  const accounts=[{id:'owned-A',email:'a@example.test',is_default:true,label:'Personal A'}];
  const listAccounts=vi.fn(async()=>accounts);
  const setDefault=vi.fn(async id=>id);
  const disconnectAccount=vi.fn(async()=>1);
  const listConnections=vi.fn(async()=>[{id:'a-connection',profile:'read_only'}]);
  const revokeConnection=vi.fn(async()=>1);
  const listChanges=vi.fn(async()=>[]);
  const clients={actingAs:'a@example.test',gmail:{users:{getProfile:vi.fn(async()=>({
   data:{emailAddress:'a@example.test',messagesTotal:7}
  }))}},store:{listAccounts,setDefault,disconnectAccount,listConnections,
   revokeConnection,listChanges}};
  expect(unpack(await accountHandlers.workspace_whoami({},clients))).toMatchObject({actingAs:'a@example.test',matches:true});
  expect(unpack(await accountHandlers.workspace_list_accounts({},clients))).toEqual(accounts);
  expect(unpack(await accountHandlers.workspace_set_default_account({email:'a@example.test'},clients))).toEqual(accounts);
  expect(setDefault).toHaveBeenCalledWith('owned-A');
  await expect(accountHandlers.workspace_set_default_account({email:'foreign@example.test'},clients)).rejects.toThrow('outside_scope');
  expect(unpack(await accountHandlers.workspace_list_connections({},clients))).toEqual(await listConnections());
  expect((await accountHandlers.workspace_revoke_connection({tokenPrefix:'not-owned',confirm:true},clients)).content[0].text).toMatch(/not found/);
  expect(revokeConnection).not.toHaveBeenCalled();
  expect(unpack(await accountHandlers.workspace_revoke_connection({tokenPrefix:'a-connection',confirm:true},clients)).revoked).toBe(true);
  expect(revokeConnection).toHaveBeenCalledWith('a-connection');
  expect(unpack(await accountHandlers.workspace_remove_account({email:'a@example.test',confirm:true},clients))).toEqual(accounts);
  expect(disconnectAccount).toHaveBeenCalledWith('owned-A');
  await expect(accountHandlers.workspace_set_allowed_domains({email:'a@example.test',domains:['all.example']},clients))
   .rejects.toThrow('outside_scope');
  unpack(await accountHandlers.workspace_recent_changes({limit:5},clients));
  expect(listChanges).toHaveBeenCalledWith(expect.objectContaining({limit:5}));
 });
 it('passes exact owned change lookups into undo before any provider client calls',async()=>{
  const lookup=vi.fn(async()=>null);
  const clients={actingAs:'a@example.test',connection:'principal-A-connection',
   store:{getOwnedChange:vi.fn(async()=>null)}};
  await expect(prepareUndo({changeId:22},clients,lookup)).rejects.toThrow('Change not found');
  expect(clients.store.getOwnedChange).toHaveBeenCalledWith(22,'a@example.test','principal-A-connection');
  expect(lookup).not.toHaveBeenCalled();
 });
 it('stored result reads consult the tenant store, never the legacy shared store',async()=>{
  const clients={connection:'conn-A',store:{getResult:vi.fn(async()=>null)}};
  const output=await metaHandlers.workspace_get_result({handle:'rtc_result_'+ 'x'.repeat(32)},clients);
  expect(output.isError).toBe(true);
  expect(clients.store.getResult).toHaveBeenCalledWith('rtc_result_'+ 'x'.repeat(32),'conn-A');
 });
});
