import { describe, it, expect, vi } from 'vitest';
import { policyFilter, parsePolicyPage, readPolicyPage, scanPolicyPages } from '../../src/tools/policy-scan.js';
import { handlers } from '../../src/tools/policy-audit.js';

const policy = (id, type, value) => ({
  name: 'policies/' + id, customer: 'customers/C123',
  type: 'ADMIN', policyQuery: {orgUnit:'orgUnits/root'},
  setting: {type, value}
});
const row = policy('email', 'settings/gmail.external_recipient_warning', {enabled: false});
const client = list => ({
  allowedDomains: ['example.com'], crossDomain: true,
  cloudidentity: {policies: {list}}
});
const json = response => JSON.parse(response.content[0].text);

describe('P7-2 complete bounded provider page and evidence contract', () => {
  it('constructs a Google-documented customer and application filter without accepting injection', () => {
    expect(policyFilter()).toBe('customer == "customers/my_customer"');
    expect(policyFilter('gmail')).toContain("setting.type.matches('^settings/gmail");
    expect(policyFilter('other')).toBe(policyFilter());
    for (const area of ['gmail;DROP', 'x\\n', 'groups-for-business']) {
      expect(() => policyFilter(area)).toThrow();
    }
  });
  it('rejects malformed successful HTTP 200 bodies instead of marking policies absent', () => {
    for (const bad of [
      null, {}, {data:null}, {data:[]}, {data:{policies:{}}},
      {data:{policies:[{name:'policies/1'}]}},
      {data:{policies:[{...row,setting:{...row.setting,value:null}}]}},
      {data:{policies:[{...row,type:'UNKNOWN'}]}},
      {data:{nextPageToken:17}},
      {data:{nextPageToken:'',policies:[]}}
    ]) expect(() => parsePolicyPage(bad)).toThrow();
    expect(parsePolicyPage({data:{}})).toEqual({policies:[],nextPageToken:null});
  });
  it('reads all pages, waits per customer, sends the same filter each time, and deduplicates identical resources', async () => {
    const calls=[],waits=[];
    const list=vi.fn(async args=>{
      calls.push(args);
      return {data: args.pageToken ? {policies:[row,policy('2','settings/gmail.external_recipient_warning',{enabled:true})]} :
        {policies:[row],nextPageToken:'second'}};
    });
    const result=await scanPolicyPages(client(list),{filter:policyFilter('gmail'),pageSize:20},{wait:async ms=>waits.push(ms)});
    expect(result).toMatchObject({complete:true,pagesRead:2,nextPageToken:null,incompleteReason:null});
    expect(result.policies.map(p=>p.name)).toEqual(['policies/email','policies/2']);
    expect(waits).toEqual([1100]);
    expect(calls).toEqual([{filter:policyFilter('gmail'),pageSize:20},
      {filter:policyFilter('gmail'),pageSize:20,pageToken:'second'}]);
  });
  it('refuses token loops, conflicting identities and impossible policies', async () => {
    const fakeWait={wait:async()=>{}};
    await expect(scanPolicyPages(client(async()=>({data:{policies:[],nextPageToken:'same'}})),{},fakeWait))
      .rejects.toThrow(/repeated/);
    let count=0;
    await expect(scanPolicyPages(client(async()=>{
      count++;return {data:count===1?{policies:[row],nextPageToken:'more'}:
        {policies:[{...row,setting:{...row.setting,value:{enabled:true}}}]}};
    }),{},fakeWait)).rejects.toThrow(/Conflicting/);
    await expect(scanPolicyPages(client(async()=>({data:{policies:[{name:'other',setting:{type:'settings/gmail.foo',value:{}}}]}})),{},fakeWait))
      .rejects.toThrow(/invalid policy resource/);
  });
  it('signals incompleteness and continuation when a large customer exceeds page budget', async () => {
    let number=0;
    const result=await scanPolicyPages(client(async()=>({data:{policies:[policy(String(++number),
      'settings/gmail.external_recipient_warning',{enabled:true})],nextPageToken:'page'+number}})),
      {maxPages:3},{wait:async()=>{}});
    expect(result).toMatchObject({complete:false,pagesRead:3,nextPageToken:'page3',incompleteReason:'page_cap_reached'});
    expect(result.policies).toHaveLength(3);
  });
  it('retries only bounded transient errors and never retries permission/consent denial', async () => {
    const wait=vi.fn(async()=>{});
    const list=vi.fn().mockRejectedValueOnce({response:{status:429,headers:{'retry-after':'2'}}})
      .mockRejectedValueOnce({response:{status:503}}).mockResolvedValue({data:{policies:[row]}});
    expect((await readPolicyPage(client(list),{filter:policyFilter(),pageSize:100},{wait})).policies).toHaveLength(1);
    expect(list).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls[0][0]).toBe(2000);
    const denied=vi.fn().mockRejectedValue({response:{status:403}});
    await expect(readPolicyPage(client(denied),{filter:policyFilter(),pageSize:100},{wait})).rejects.toBeTruthy();
    expect(denied).toHaveBeenCalledTimes(1);
    expect(wait).toHaveBeenCalledTimes(2);
  });
  it('returns owner baseline revision and explicit-only evidence; partial scans cannot report clean',async()=>{
    const first=json(await handlers.identity_policy_audit({domain:'example.com',area:'gmail'},
      client(async()=>({data:{policies:[row]}}))));
    expect(first).toMatchObject({complete:true,effective:false,baselineSource:'src/data/policy-baseline.json',
      pagesRead:1,nextPageToken:null});
    expect(first.baselineRevision).toMatch(/^[0-9a-f]{64}$/);
    expect(first.summary.needsAttention).toBeGreaterThan(0);
    expect(first.results.find(x=>x.policySetting===row.setting.type).status).toBe('needs_attention');
  });
});
