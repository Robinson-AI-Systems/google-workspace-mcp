import {describe,it,expect} from 'vitest';
import {ok} from '../../src/tools/util.js';
import {buildAdminOverview} from '../../src/tools/admin-overview.js';
import {handlers as opsHandlers} from '../../src/tools/ops.js';
import {CONSOLE_MAP} from '../../src/data/console-map.js';
import {audienceFor,isWrite} from '../../src/rtc/catalog.js';
import {registry} from '../../src/tools/index.js';
describe('RTC owner overview and structured settings',()=>{
 it('reports actually observed warning states and explicit no-API gaps',async()=>{
  const calls=[];
  const fake=async(name)=>{
   calls.push(name);
   if(name==='workflow_security_snapshot')return ok({totalUsers:4,usersWithout2StepVerification:['user@example.test']});
   if(name==='workflow_email_health')return ok('WARN: DKIM needs attention');
   return ok({healthy:true});
  };
  const overview=await buildAdminOverview({actingAs:'ops@example.test',rtcPolicy:{profile:'full'}},fake);
  expect(overview.items.security.status).toBe('needs_attention');
  expect(overview.items.email.status).toBe('needs_attention');
  expect(overview.items.identity.status).toBe('ok');
  expect(overview.items.billing_invoices).toMatchObject({status:'not_readable'});
  expect(calls).toContain('workflow_health_report');
 });
 it('never invokes excluded areas even through a compound owner read',async()=>{
  const called=[];
  const overview=await buildAdminOverview({actingAs:'ops@example.test',rtcPolicy:{profile:'read_only',areas:['workspace']}},async name=>{called.push(name);return ok({});});
  expect(overview.items.security.status).toBe('not_readable');
  expect(overview.items.email.status).toBe('not_readable');
  expect(called.every(name=>name.startsWith('workspace_'))).toBe(true);
 });
 it('offers numbered steps and an expected result without claiming changes',async()=>{
  const output=await opsHandlers.workspace_where_is_setting({query:'dkim'});
  const result=JSON.parse(output.content[0].text);
  expect(result.found).toBe(true);
  expect(result.setting).toMatch(/DKIM/i);
  expect(result.url).toMatch(/^https:\/\//);
  expect(result.steps[0]).toMatchObject({n:1,action:'Navigate to'});
  expect(result.expected).toMatch(/No setting has been changed/);
  expect(Array.isArray(result.matches[0].steps)).toBe(true);
 });
 it('has guided paths for every existing console map item',()=>{
  for(const entry of CONSOLE_MAP){expect(entry.path?.length,entry.id).toBeGreaterThan(0);expect(typeof entry.title).toBe('string');}
 });
 it('exposes real audience tags and read-only overview metadata',()=>{
  expect(audienceFor('admin_make_super_admin')).toContain('owner');
  expect(audienceFor('gmail_list_messages')).toContain('operator');
  expect(isWrite('workspace_admin_overview')).toBe(false);
  expect(registry.tools.some(t=>t.name==='workspace_admin_overview')).toBe(true);
 });
});
