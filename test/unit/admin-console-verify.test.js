import {describe,it,expect} from 'vitest';
import {planConsoleReadbacks,executeConsoleReadbacks,discoverConsoleReadbacks,
 CONSOLE_LIVE_READBACK_IDS,tools,handlers}
 from '../../src/tools/admin-console-verify.js';
import {CONSOLE_MAP,CONSOLE_VERIFICATION} from '../../src/data/console-map.js';
import {CONSOLE_REVIEW_GROUPS} from '../../src/data/console-review.js';
import {READ_ONLY_TOOL_NAMES} from '../../src/rtc/read-only-semantics.js';
import {isWrite,rtcArea} from '../../src/rtc/catalog.js';
import {ok,errorResult} from '../../src/tools/util.js';

const actingAs='dev@example.test';
const clients={actingAs,rtcPolicy:{profile:'read_only'}};
const samples={
 'gmail-imap-pop':{enabled:true},
 'gmail-default-routing-delegation':[],
 'email-forwarding':{enabled:false},
 'out-of-office':{enableAutoReply:false},
 'signature':[{sendAsEmail:actingAs}],
 'drive-storage':{usage:'12',limit:'2500'},
 'domains':[{domainName:'example.test',verified:true}],
 'org-units':[{orgUnitPath:'/'}],
 'users':[{primaryEmail:'dev@example.test'}],
 'admin-roles':[{roleAssignmentId:'assignment-1'}],
 'alerts':[],
 'calendar-resources':[],
 'mobile-management':[],
 'chrome-management':[],
 'billing-plan':{totalLicensesAssigned:2,plans:[{assigned:2}]},
 '2sv':{primaryEmail:actingAs,isEnrolledIn2Sv:true,isEnforcedIn2Sv:false},
 'recovery':{primaryEmail:actingAs},
 'groups-settings':{email:'ops@example.test',whoCanPostMessage:'ALL_MEMBERS_CAN_POST'},
 'dkim':{domain:'example.test',summary:{pass:1,warn:0,fail:0,info:0},
  checks:[{check:'DKIM',status:'PASS'}]},
 'spf-dmarc':{domain:'example.test',summary:{pass:1,warn:0,fail:0,info:0},
  checks:[{check:'DMARC',status:'PASS'}]}
};
const targets={subjectEmail:actingAs,groupEmail:'ops@example.test',domain:'example.test'};
const callFake=(callLog,override={})=>async (tool,args,source)=>{
 callLog.push({tool,args,account:source.actingAs});
 const topic=Object.keys(CONSOLE_VERIFICATION).find(id=>CONSOLE_VERIFICATION[id].tool===tool&&
    Object.hasOwn(samples,id));
 // Multiple topics can share one source; tests call unique subsets,
 // so the first matching response is sufficient for those cases.
 const data=Object.hasOwn(override,tool)?override[tool]:samples[topic];
 return ok(data);
};
describe('P8-8 scoped Admin console readback composition',()=>{
 it('covers exactly the reviewed existing console map, never a guessed mutation',()=>{
  const all=new Set(CONSOLE_MAP.map(x=>x.id));
  expect(CONSOLE_MAP.length).toBe(50);
  expect(CONSOLE_LIVE_READBACK_IDS.length).toBe(24);
  expect(new Set(CONSOLE_LIVE_READBACK_IDS).size).toBe(CONSOLE_LIVE_READBACK_IDS.length);
  expect(CONSOLE_LIVE_READBACK_IDS.every(id=>all.has(id)&&CONSOLE_VERIFICATION[id])).toBe(true);
  expect(tools.map(x=>x.name)).toEqual([
   'workspace_admin_console_verify','workspace_admin_console_capabilities'
  ]);
  for(const tool of tools){
   expect(READ_ONLY_TOOL_NAMES.has(tool.name)).toBe(true);
   expect(isWrite(tool.name)).toBe(false);
   expect(rtcArea(tool.name)).toBe('workspace');
  }
 });
 it('validates the entire request before any provider read',async()=>{
  const invalid=[
   {},{ids:[]},{ids:['not-real']},{ids:['gmail-imap-pop','gmail-imap-pop']},
   {ids:Array(11).fill('gmail-imap-pop')},
   {ids:['gmail-imap-pop'],crossDomain:'yes'},
   {ids:['2sv'],subjectEmail:'evil@example.test/x'},
   {ids:['groups-settings'],groupEmail:'../../ops@example.test'},
   {ids:['dkim'],domain:'http://example.test'},
   {ids:['2sv'],subjectEmail:'dev@example.test ',crossDomain:false}
  ];
  for(const item of invalid){
   expect(()=>planConsoleReadbacks(item,clients),JSON.stringify(item)).toThrow();
   const logs=[];
   await expect(executeConsoleReadbacks(item,clients,callFake(logs))).rejects.toThrow();
   expect(logs).toHaveLength(0);
  }
 });
 it('refuses to infer missing named resource targets and never silently cross business boundaries',()=>{
  const r=planConsoleReadbacks({ids:['2sv','groups-settings','dkim',
    'domains','gmail-imap-pop']},clients);
  expect(r.map(x=>x.status)).toEqual([
   'needs_target','needs_target','needs_target','outside_scope','eligible'
  ]);
  const out=planConsoleReadbacks({ids:['recovery'],subjectEmail:'user@other.test'},clients);
  expect(out[0].status).toBe('outside_scope');
  const allowed=planConsoleReadbacks({ids:['recovery'],subjectEmail:'user@other.test',
   crossDomain:true},clients);
  expect(allowed[0].status).toBe('eligible');
 });
 it('only probes exact authorized mailbox readback IDs and never returns Google object details',async()=>{
  const calls=[];
  const report=await executeConsoleReadbacks({ids:['gmail-imap-pop','email-forwarding',
   'out-of-office','signature','drive-storage']},clients,callFake(calls));
  expect(report).toMatchObject({complete:true,mode:'read_only_google_observation',
   summary:{total:5,observed:5,notReadable:0}});
  expect(report.entries.map(x=>x.status)).toEqual(Array(5).fill('observed'));
  expect(calls.map(x=>x.tool)).toEqual([
   'gmail_get_imap_settings','gmail_get_forwarding_settings',
   'gmail_get_vacation_settings','gmail_list_send_as','drive_get_storage_quota'
  ]);
  expect(calls.every(x=>Object.keys(x.args).length===0)).toBe(true);
  expect(JSON.stringify(report)).not.toContain('enableAutoReply');
  expect(JSON.stringify(report)).not.toContain('usageInDrive');
 });
 it('never converts customer-wide API reads to full domain-policy proof',async()=>{
  const calls=[];
  const r=await executeConsoleReadbacks({ids:['domains','users','billing-plan'],crossDomain:true},
   clients,async (name,args,c)=>{
    calls.push({name,args});
    return ok(name==='admin_list_domains'?samples.domains:
     name==='admin_list_users'?samples.users:samples['billing-plan']);
   });
  expect(r.complete).toBe(true);
  expect(r.summary).toMatchObject({observed:0,observedPartial:3,notReadable:0});
  expect(r.entries.every(x=>x.status==='observed_partial')).toBe(true);
  expect(r.entries.find(x=>x.id==='users').observedCount).toBe(1);
  expect(calls.find(x=>x.name==='admin_list_users').args).toEqual({maxResults:20});
 });
 it('rejects HTTP-like success text, error payloads and wrong Gmail shapes',async()=>{
  for(const malformed of [
   ok('Everything worked'),errorResult(new Error('Provider unauthorized')),
   ok({ok:true,result:{}}),ok({enabled:'yes'}),ok({error:'Provider disabled'})
  ]){
   const r=await executeConsoleReadbacks({ids:['gmail-imap-pop']},clients,
    async()=>malformed);
   expect(r).toMatchObject({complete:false,summary:{notReadable:1}});
   expect(r.entries[0].status).toBe('not_readable');
  }
 });
 it('keeps independent partial successes when a separate provider child rejects',async()=>{
  const calls=[];
  const r=await executeConsoleReadbacks({ids:['gmail-imap-pop','out-of-office']},
   clients,async (name,...rest)=>{
    calls.push(name);
    if(name==='gmail_get_vacation_settings')throw Error('Secret exception');
    return ok(samples['gmail-imap-pop']);
   });
  expect(r.entries.map(x=>x.status)).toEqual(['observed','not_readable']);
  expect(r.summary.notReadable).toBe(1);
  expect(JSON.stringify(r)).not.toContain('Secret exception');
  expect(calls).toHaveLength(2);
 });
 it('plans dry runs without contacting Google and never counts plans as readbacks',async()=>{
  const calls=[];
  const r=await executeConsoleReadbacks({ids:['domains','gmail-imap-pop'],dryRun:true},
   clients,callFake(calls));
  expect(r.mode).toBe('review_preview');
  expect(r.complete).toBe(false);
  expect(r.entries.map(x=>x.status)).toEqual(['outside_scope','planned']);
  expect(r.summary).toMatchObject({outsideScope:1,planned:1,observed:0});
  expect(calls).toHaveLength(0);
 });
 it('supports exact 2SV user and group settings with server-owned per-account scope',async()=>{
  const seen=[];
  const r=await executeConsoleReadbacks({ids:['2sv','groups-settings'],...targets},clients,
   async (name,args)=>{
    seen.push({name,args});
    return ok(name==='admin_get_2sv_status'?samples['2sv']:samples['groups-settings']);
   });
  expect(r.complete).toBe(true);
  expect(seen).toEqual([
   {name:'admin_get_2sv_status',args:{userEmail:actingAs}},
   {name:'admin_get_group_settings',args:{groupEmail:'ops@example.test'}}
  ]);
 });
 it('never returns a ready result for a provider record belonging to a different user',async()=>{
  const r=await executeConsoleReadbacks({ids:['2sv'],...targets},clients,
   async()=>ok({primaryEmail:'other@example.test',
    isEnrolledIn2Sv:true,isEnforcedIn2Sv:true}));
  expect(r.summary.notReadable).toBe(1);
 });
});
