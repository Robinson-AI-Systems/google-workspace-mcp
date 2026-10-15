import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '../helpers/fake-db.js';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async importActual => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map(name => [name, (...a) => holder.db[name](...a)]));
});
const { registry } = await import('../../src/tools/index.js');
const { normalizeBulkArgs } = await import('../../src/tools/bulk.js');
const { isWrite, allowedTool } = await import('../../src/rtc/catalog.js');
const body = response => JSON.parse(response.content[0].text);
const bulk = registry.handlers.workspace_bulk_operation;
const args = (over = {}) => ({
  operation: 'add_group_member', targets: ['a@example.test', 'b@example.test'],
  parameters: { groupKey: 'staff@example.test', role: 'MEMBER' }, ...over
});
function env() {
  const e = makeFakeClients();
  e.clients.allowedDomains = ['example.test'];
  e.clients.delegationReady = true;
  e.clients.rtcPolicy = { profile: 'full', areas: ['workspace','admin','workflows'] };
  e.when('admin.members.get').resolves(({ memberKey }) => ({ data: { email: memberKey, role: 'MEMBER' } }));
  e.when('admin.members.insert').resolves(({ requestBody }) => ({ data: requestBody }));
  return e;
}
beforeEach(() => { holder.db = createFakeDb(); });

describe('P7-8 strict contract and registry', () => {
  it('is a registered guarded write and remains inaccessible to read-only and everyday policies', () => {
    const tool = registry.tools.find(t => t.name === 'workspace_bulk_operation');
    expect(tool.inputSchema.additionalProperties).toBe(false);
    expect(tool.inputSchema.properties.dryRun.type).toBe('boolean');
    expect(tool.inputSchema.properties.confirm.type).toBe('boolean');
    expect(isWrite(tool.name)).toBe(true);
    expect(allowedTool(tool.name, { profile: 'read_only' })).toBe(false);
    expect(allowedTool(tool.name, { profile: 'everyday' })).toBe(false);
    expect(allowedTool(tool.name, { profile: 'full', areas: ['admin'] })).toBe(false);
  });

  it('normalizes all named users, fixed shared params, and no blanket expansion', () => {
    const n = normalizeBulkArgs(args({ targets: ['A@Example.Test'], parameters: { groupKey: 'STAFF@example.test' } }));
    expect(n.targets).toEqual(['a@example.test']);
    expect(n.parameters).toEqual({ groupKey: 'staff@example.test', role: 'MEMBER' });
    for (const bad of [
      args({ targets: [] }), args({ targets: Array.from({length:21}, (_,i) => 'p'+i+'@example.test') }),
      args({ targets:['a@example.test','A@example.test'] }), args({ targets:['all'] }),
      args({ targets: ['someone'] }), args({ targets: ['u@x.test ']}), args({ targets: [{email:'u@example.test'}] }),
      args({ extra:true }), args({ parameters: {groupKey:'staff@example.test', userEmail:'x@example.test'} }),
      args({ parameters: {groupKey:'fake-id'} }), args({ confirm:'true' }), args({ crossDomain:'yes' }),
      args({ operation:'workspace_call' }), args({ operation:'set_signature', parameters: { signatureHtml: 2 } }),
      args({ operation:'set_vacation', parameters:{vacation:{enableAutoReply:'true'}} }),
      args({ operation:'set_vacation', parameters:{vacation:{enableAutoReply:true,unexpected:true}} }),
      args({ operation:'set_vacation', parameters:{vacation:{enableAutoReply:true,startTime:'1770000000000',endTime:'1760000000000'}} }),
      args({ operation:'change_license', parameters:{ skuId:'old' } })
    ]) expect(() => normalizeBulkArgs(bad)).toThrow(/invalid_args/);
  });

  it('refuses malformed input BEFORE even a child preview', async () => {
    const { clients, calls } = env();
    await expect(bulk(args({targets:Array(21).fill('a@example.test'),dryRun:true}),clients)).rejects.toThrow('invalid_args');
    expect(calls).toEqual([]);
  });
});

describe('combined preview, confirmation and target order', () => {
  it('previews 20 named targets without a single provider mutation', async () => {
    const { clients, calls } = env();
    const targets = Array.from({length:20},(_,i)=>'a'+i+'@example.test');
    const v = body(await bulk(args({targets,dryRun:true}),clients));
    expect(v).toMatchObject({done:false,dryRun:true,logged:true});
    expect(v.details.status).toBe('preview');
    expect(v.details.total).toBe(20);
    expect(v.details.results.map(x=>x.target)).toEqual(targets);
    expect(v.details.counts.preview).toBe(20);
    expect(Object.values(v.details.counts).reduce((a,b)=>a+b,0)).toBe(20);
    expect(calls.filter(x=>x.path==='admin.members.insert')).toEqual([]);
  });

  it('a confirmation-less call changes nothing, including an ordinary non-destructive child', async () => {
    const {clients,calls}=env();
    expect(body(await bulk(args(),clients))).toMatchObject({done:false,needsConfirmation:true});
    expect(calls.filter(x=>x.path==='admin.members.insert')).toEqual([]);
  });

  it('executes guarded child calls sequentially, preserves exact target evidence and counts', async () => {
    const {clients,calls}=env();
    const response=body(await bulk(args({confirm:true}),clients));
    expect(response.done).toBe(true);
    expect(response.details).toMatchObject({status:'complete',total:2,counts:{confirmed:2,refused:0,unknown:0}});
    expect(response.details.results.map(r=>r.target)).toEqual(['a@example.test','b@example.test']);
    const inserted=calls.filter(x=>x.path==='admin.members.insert');
    expect(inserted.map(x=>x.args[0])).toEqual([
      {groupKey:'staff@example.test',requestBody:{email:'a@example.test',role:'MEMBER'}},
      {groupKey:'staff@example.test',requestBody:{email:'b@example.test',role:'MEMBER'}}
    ]);
  });

  it('continues after a refused domain without waiving group-domain enforcement',async()=>{
    const {clients,calls}=env();
    const out=body(await bulk(args({targets:['out@other.test','a@example.test'],confirm:true}),clients)).details;
    expect(out.status).toBe('incomplete');
    expect(out.results.map(x=>x.status)).toEqual(['refused','confirmed']);
    expect(calls.filter(x=>x.path==='admin.members.insert')).toHaveLength(1);
    const denied=body(await bulk(args({parameters:{groupKey:'outside@other.test'},confirm:true}),clients)).details;
    expect(denied.counts.refused).toBe(2);
    expect(calls.filter(x=>x.path==='admin.members.insert')).toHaveLength(1);
  });

  it('requires independent explicit cross-domain intent without mutating shared context',async()=>{
    const {clients,calls}=env();
    const out=body(await bulk(args({targets:['out@other.test'],crossDomain:true,confirm:true}),clients)).details;
    expect(out.results[0].status).toBe('confirmed');
    expect(clients.crossDomain).toBeUndefined();
    expect(calls.some(x=>x.path==='admin.members.insert')).toBe(true);
  });

  it('refuses when either parent or child policy area is missing',async()=>{
    const {clients,calls}=env();
    clients.rtcPolicy={profile:'read_only'};
    let out=body(await bulk(args({confirm:true}),clients)).details;
    expect(out.counts.refused).toBe(2);
    clients.rtcPolicy={profile:'full',areas:['workspace']};
    out=body(await bulk(args({confirm:true}),clients)).details;
    expect(out.counts.refused).toBe(2);
    expect(calls.filter(x=>x.path==='admin.members.insert')).toHaveLength(0);
  });

  it('an individual API denial does not prevent later targets',async()=>{
    const {clients,calls,when}=env();
    when('admin.members.insert').resolves(({requestBody})=> {
      if(requestBody.email==='a@example.test')throw googleError(403,'forbidden','private access');
      return {data:requestBody};
    });
    const out=body(await bulk(args({confirm:true}),clients)).details;
    expect(out.results.map(r=>r.status)).toEqual(['refused','confirmed']);
    expect(calls.filter(x=>x.path==='admin.members.insert')).toHaveLength(2);
    expect(JSON.stringify(out)).not.toContain('private access');
  });

  it('a transient write failure is unknown, never automatically retried, and later targets proceed',async()=>{
    const {clients,calls,when}=env();
    when('admin.members.insert').resolves(({requestBody})=> {
      if(requestBody.email==='a@example.test')throw googleError(500,'backendError','possibly written');
      return {data:requestBody};
    });
    const out=body(await bulk(args({confirm:true}),clients)).details;
    expect(out.results.map(r=>r.status)).toEqual(['unknown','confirmed']);
    expect(calls.filter(x=>x.path==='admin.members.insert')).toHaveLength(2);
  });

  it('authorization expiry stops subsequent dispatch with not_attempted remainder',async()=>{
    const {clients,calls,when}=env();
    when('admin.members.insert').rejects(googleError(401,'invalidCredentials','token expired'));
    const out=body(await bulk(args({targets:['a@example.test','b@example.test','c@example.test'],confirm:true}),clients)).details;
    expect(out.results.map(r=>r.status)).toEqual(['unknown','not_attempted','not_attempted']);
    expect(calls.filter(x=>x.path==='admin.members.insert')).toHaveLength(1);
  });

  it('failed readback never becomes success after a successful insert',async()=>{
    const {clients,when}=env();
    when('admin.members.get').resolves({data:{email:'somebody@example.test',role:'MEMBER'}});
    const out=body(await bulk(args({confirm:true}),clients)).details;
    expect(out.counts.unverified).toBe(2);
    expect(out.status).toBe('incomplete');
  });

  it('missing child audit receipt cannot become a confirmed result',async()=>{
    const {clients}=env();
    holder.db.saveChange=async()=>{throw new Error('db unavailable')};
    const out=body(await bulk(args({confirm:true}),clients)).details;
    expect(out.counts.unverified).toBe(2);
  });

  it('the full report is available through workspace_call; read-only batch stays read-only',async()=>{
    const {clients}=env();
    const nested=await registry.handlers.workspace_call({name:'workspace_bulk_operation',args:args({confirm:true})},clients);
    expect(body(nested).details.counts.confirmed).toBe(2);
    const batch=await registry.handlers.workspace_batch({calls:[{name:'workspace_bulk_operation',args:args({dryRun:true})}]},clients);
    expect(batch.isError).toBe(true);
  });
});

describe('fixed operation-specific fences',()=>{
  it('refuses billing-risk license assignments and changes without independent spending authority',async()=>{
    const {clients,calls}=env();
    for(const operation of ['assign_license','change_license']){
      const params=operation==='change_license'?{skuId:'old',newSkuId:'new'}:{skuId:'old'};
      const out=body(await bulk(args({operation,parameters:params,confirm:true}),clients)).details;
      expect(out.results.every(r=>r.reason==='independent_spending_approval_required')).toBe(true);
    }
    expect(calls.filter(x=>x.path.startsWith('licensing.'))).toEqual([]);
  });

  it('only the seven fixed operation mappings exist; mailbox operations need delegation',async()=>{
    const {clients,calls}=env();
    clients.delegationReady=false;
    for(const operation of ['set_signature','set_vacation']){
      const parameters=operation==='set_signature'?{signatureHtml:'<b>hello</b>'}:{vacation:{enableAutoReply:true,responseSubject:'Away'}};
      const out=body(await bulk(args({operation,parameters,dryRun:true}),clients)).details;
      expect(out.counts.refused).toBe(2);
    }
    expect(calls.filter(x=>/sendAs|Vacation/.test(x.path))).toHaveLength(0);
    const n=normalizeBulkArgs(args({operation:'remove_license',parameters:{skuId:'sku'}}));
    expect(n.parameters).toEqual({skuId:'sku',productId:'Google-Apps'});
  });
});
