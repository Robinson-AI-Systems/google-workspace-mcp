import {describe,it,expect} from 'vitest';
import {CONSOLE_MAP,CONSOLE_VERIFICATION} from '../../src/data/console-map.js';
import {handlers as ops} from '../../src/tools/ops.js';
import {registry} from '../../src/tools/index.js';
import {allowedTool,isWrite} from '../../src/rtc/catalog.js';

const json=r=>JSON.parse(r.content[0].text);
const known=new Set(registry.tools.map(t=>t.name));

describe('P8-8 honest readbacks for guided manual console settings',()=>{
 it('only references audited read-only operations and known console topics',()=>{
  const ids=new Set(CONSOLE_MAP.map(e=>e.id));
  expect(Object.keys(CONSOLE_VERIFICATION).length).toBeGreaterThanOrEqual(20);
  for(const [id,verification] of Object.entries(CONSOLE_VERIFICATION)){
   expect(ids.has(id),id).toBe(true);
   expect(known.has(verification.tool),id).toBe(true);
   expect(isWrite(verification.tool),id).toBe(false);
   expect(verification.note.length,id).toBeGreaterThan(38);
  }
 });
 it('provides usable tool names and narrowly qualified evidence for documented settings',async()=>{
  for(const [query,name] of [
   ['dkim','workflow_email_health'],
   ['spf','workflow_email_health'],
   ['email signature','gmail_list_send_as'],
   ['password recovery','admin_get_user'],
   ['which marketplace apps are allowed',null],
   ['change my plan or payment method','workspace_plan_summary']
  ]){
   const result=json(await ops.workspace_where_is_setting({query}));
   expect(result.found,query).toBe(true);
   // Search can return several relevant matches; inspect the requested topic.
   if(name){
    const choices=[result,...result.alternatives];
    expect(choices.some(g=>g.verifyWith===name),query).toBe(true);
    expect(choices.filter(g=>g.verifyWith===name).every(g=>/not |only|no |cannot |does not |unverified/i.test(g.verificationNote)),query).toBe(true);
   }else{
    expect(result.verifyWith,query).toBeUndefined();
   }
  }
 });
 it('never exposes a readback outside the connection area, even for a read_only profile',async()=>{
  const input={query:'email signature'};
  const restricted={rtcPolicy:{profile:'read_only',areas:['workspace']}};
  const r=json(await ops.workspace_where_is_setting(input,restricted));
  expect(r.setting).toMatch(/signature/i);
  expect(r.verifyWith).toBeUndefined();
  expect(r.verificationNote).toMatch(/outside this connection/);
  expect(allowedTool('gmail_list_send_as',restricted.rtcPolicy)).toBe(false);
 });
 it('does not claim to have run the provider read or modified console settings',async()=>{
  const clients={rtcPolicy:{profile:'read_only'},gmail:{
   users:{getProfile(){throw new Error('must not be called')}}}};
  const r=json(await ops.workspace_where_is_setting({query:'dkim'},clients));
  expect(r.verifyWith).toBe('workflow_email_health');
  expect(r.expected).toMatch(/No setting has been changed or verified/);
  expect(r.note).toMatch(/No changes are claimed/);
  expect(r.steps[0]).toMatchObject({n:1,action:'Navigate to'});
 });
 it('keeps unverified console-only settings honest',async()=>{
  const r=json(await ops.workspace_where_is_setting({query:'single sign on SSO'}));
  expect(r.found).toBe(true);
  expect(r.verifyWith).toBeUndefined();
  expect(r.expected).toMatch(/No setting has been changed or verified/);
 });
});
