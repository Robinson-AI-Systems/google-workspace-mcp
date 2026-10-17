import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeDb } from '../helpers/fake-db.js';
import { makeFakeClients, googleError } from '../helpers/fake-google.js';
const holder = vi.hoisted(() => ({ db: null }));
vi.mock('../../src/db.js', async importActual => {
  const real = await importActual();
  return Object.fromEntries(Object.keys(real).map(name => [name, (...a) => holder.db[name](...a)]));
});
const { registry } = await import('../../src/tools/index.js');
const { normalizeBulkArgs, readMailboxExact } = await import('../../src/tools/bulk.js');
const { inheritGuardedWrite } = await import('../../src/tools/write.js');
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
    holder.db.recordChange=async()=>{throw new Error('db unavailable')};
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
  it('discloses unknown Google licensing exposure with an argument-bound stable SHA256 digest and NO write',async()=>{
    const {clients,calls,when}=env();
    when('licensing.licenseAssignments.get').resolves(({skuId,userId})=>({data:{productId:'Google-Apps',skuId,userId}}));
    const input=args({operation:'assign_license',parameters:{skuId:'test-sku'},dryRun:true});
    const preview=body(await bulk(input,clients));
    expect(preview.costNotice).toMatchObject({mayIncurCharges:true,estimateStatus:'unknown',priceEstimate:null,
      targetCount:2,productId:'Google-Apps',skuId:'test-sku',unknownOrUnboundedExposure:true});
    expect(preview.costNotice.requestDigest).toMatch(/^[a-f0-9]{64}$/);
    expect(preview.details.counts.preview).toBe(2);
    const reordered=body(await bulk({...input,targets:[...input.targets].reverse()},clients));
    expect(reordered.costNotice.requestDigest).toBe(preview.costNotice.requestDigest);
    const before=calls.filter(x=>/licensing\.licenseAssignments\.(insert|patch|delete)/.test(x.path));
    expect(before).toHaveLength(0);
    const noCost=body(await bulk({...input,dryRun:false,confirm:true},clients));
    expect(noCost).toMatchObject({done:false,needsCostConfirmation:true});
    expect(noCost.costNotice.requestDigest).toBe(preview.costNotice.requestDigest);
    expect(calls.filter(x=>x.path==='licensing.licenseAssignments.insert')).toHaveLength(0);
  });

  it('denies wrong or stale licensing consent without a provider write and rejects cost flags on nonbillable tools',async()=>{
    const {clients,calls}=env();
    const input=args({operation:'change_license',parameters:{skuId:'starter',newSkuId:'plus'}});
    const old=body(await bulk({...input,dryRun:true},clients)).costNotice.requestDigest;
    for(const request of [
      {...input,confirm:true,confirmCost:true,approvedCostDigest:'0'.repeat(64)},
      {...input,confirm:true,confirmCost:true,approvedCostDigest:old,parameters:{skuId:'starter',newSkuId:'premium'}},
      {...input,confirm:true,confirmCost:false,approvedCostDigest:old}
    ]) {
      const refused=body(await bulk(request,clients));
      expect(refused.done).toBe(false);
    }
    expect(calls.filter(x=>x.path==='licensing.licenseAssignments.patch')).toHaveLength(0);
    expect(()=>normalizeBulkArgs(args({confirmCost:true}))).toThrow('invalid_args');
    expect(()=>normalizeBulkArgs(args({approvedCostDigest:'0'.repeat(64)}))).toThrow('invalid_args');
  });

  it('uses the original guarded licensing insert with the exact published Google API shape and readback',async()=>{
    const {clients,calls,when}=env();
    when('licensing.licenseAssignments.insert').resolves(({productId,skuId,requestBody})=>
      ({data:{productId,skuId,userId:requestBody.userId}}));
    when('licensing.licenseAssignments.get').resolves(({productId,skuId,userId})=>({data:{productId,skuId,userId}}));
    const input=args({operation:'assign_license',parameters:{skuId:'business-plus'}});
    const preview=body(await bulk({...input,dryRun:true},clients));
    const approved=body(await bulk({...input,confirm:true,confirmCost:true,
      approvedCostDigest:preview.costNotice.requestDigest},clients));
    expect(approved.details.counts.confirmed).toBe(2);
    expect(calls.filter(x=>x.path==='licensing.licenseAssignments.insert').map(x=>x.args[0])).toEqual([
      {productId:'Google-Apps',skuId:'business-plus',requestBody:{userId:'a@example.test'}},
      {productId:'Google-Apps',skuId:'business-plus',requestBody:{userId:'b@example.test'}}
    ]);
    expect(calls.filter(x=>x.path==='licensing.licenseAssignments.get')).toHaveLength(6);
    expect(approved.done).toBe(true);
  });

  it('standing user-selected licensing authority is account and operation bound, distinct from the Full profile',async()=>{
    const {clients,calls,when}=env();
    when('licensing.licenseAssignments.insert').resolves(({productId,skuId,requestBody})=>({data:{productId,skuId,userId:requestBody.userId}}));
    when('licensing.licenseAssignments.get').resolves(({productId,skuId,userId})=>({data:{productId,skuId,userId}}));
    const assignment=args({operation:'assign_license',parameters:{skuId:'paid'}});
    clients.rtcPolicy={profile:'full',areas:['workspace','admin'],cost_policy:{
      mode:'standing',account:'ops@example.test',operations:['assign_license'],
      allowUnknownPrice:true,maxChargeUsd:null}};
    let approved=body(await bulk(assignment,clients));
    expect(approved.details.counts.confirmed).toBe(2);
    expect(calls.filter(x=>x.path==='licensing.licenseAssignments.insert')).toHaveLength(2);
    clients.rtcPolicy.cost_policy={...clients.rtcPolicy.cost_policy,maxChargeUsd:50};
    expect(body(await bulk(assignment,clients)).refused).toBe('spending_cap_unverifiable');
    clients.rtcPolicy.cost_policy={mode:'deny'};
    expect(body(await bulk(assignment,clients)).refused).toBe('user_denied_spending');
    clients.rtcPolicy.cost_policy={mode:'per_action'};
    expect(body(await bulk(assignment,clients)).needsCostConfirmation).toBe(true);
    clients.rtcPolicy={profile:'read_only',areas:['admin'],cost_policy:{mode:'per_action'}};
    const preview=body(await bulk({...assignment,dryRun:true},clients));
    expect(preview.details.counts.refused).toBe(2);
    expect(calls.filter(x=>x.path==='licensing.licenseAssignments.insert')).toHaveLength(2);
  });

  it('truthfully records a partial or unknown provider license assignment without blind replay',async()=>{
    const {clients,calls,when}=env();
    when('licensing.licenseAssignments.insert').resolves(({productId,skuId,requestBody})=>{
      if(requestBody.userId==='a@example.test')throw googleError(503,'backendError','possibly committed');
      return {data:{productId,skuId,userId:requestBody.userId}};
    });
    when('licensing.licenseAssignments.get').resolves(({productId,skuId,userId})=>({data:{productId,skuId,userId}}));
    const input=args({operation:'assign_license',parameters:{skuId:'paid'}});
    const digest=body(await bulk({...input,dryRun:true},clients)).costNotice.requestDigest;
    const result=body(await bulk({...input,confirm:true,confirmCost:true,approvedCostDigest:digest},clients));
    expect(result.details.counts.unknown).toBe(1);
    expect(result.details.counts.confirmed).toBe(1);
    expect(calls.filter(x=>x.path==='licensing.licenseAssignments.insert')).toHaveLength(2);
    expect(result.details.status).toBe('incomplete');
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

describe('P7-8 provider mapping, readback and bounded remainder', () => {
  it('removes exactly the named group members through guarded Directory calls', async () => {
    const { clients, calls, when } = env();
    when('admin.members.get').rejects(googleError(404,'notFound','member missing'));
    const a = args({ operation:'remove_group_member', parameters: { groupKey:'staff@example.test' }, confirm:true });
    const output = body(await bulk(a, clients)).details;
    expect(output.counts.confirmed).toBe(2);
    expect(calls.filter(x => x.path === 'admin.members.delete').map(x => x.args[0])).toEqual([
      { groupKey:'staff@example.test', memberKey:'a@example.test' },
      { groupKey:'staff@example.test', memberKey:'b@example.test' }
    ]);
  });

  it('removes only the requested licence via the original guarded licensing API', async () => {
    const {clients,calls,when}=env();
    when('licensing.licenseAssignments.get').rejects(googleError(404,'notFound','absent'));
    const output=body(await bulk(args({operation:'remove_license',parameters:{skuId:'sku-test'},confirm:true}),clients)).details;
    expect(output.counts.confirmed).toBe(2);
    expect(calls.filter(x=>x.path==='licensing.licenseAssignments.delete').map(x=>x.args[0])).toEqual([
      {productId:'Google-Apps',skuId:'sku-test',userId:'a@example.test'},
      {productId:'Google-Apps',skuId:'sku-test',userId:'b@example.test'}
    ]);
  });

  it('compares a nonempty delegated signature exactly, never merely hasSignature', async () => {
    const {clients}=env();
    let signature='<b>different text</b>';
    clients.gmailFor=()=>({users:{settings:{sendAs:{get:async()=>({data:{sendAsEmail:'a@example.test',signature}})}}}});
    const a=normalizeBulkArgs(args({operation:'set_signature',targets:['a@example.test'],parameters:{signatureHtml:'<b>expected text</b>'}}));
    expect(await readMailboxExact(a,'a@example.test',clients)).toBe(false);
    signature='<b>expected text</b>';
    expect(await readMailboxExact(a,'a@example.test',clients)).toBe(true);
    signature='';
    expect(await readMailboxExact(a,'a@example.test',clients)).toBe(false);
  });

  it('compares every requested vacation value, not just presence or enableAutoReply', async () => {
    const {clients}=env();
    let reply='a different nonempty response';
    clients.gmailFor=()=>({users:{settings:{getVacation:async()=>({data:{enableAutoReply:true,responseBodyHtml:reply}})}}});
    const a=normalizeBulkArgs(args({operation:'set_vacation',targets:['a@example.test'],parameters:{vacation:{enableAutoReply:true,responseBodyHtml:'right response'}}}));
    expect(await readMailboxExact(a,'a@example.test',clients)).toBe(false);
    reply='right response';
    expect(await readMailboxExact(a,'a@example.test',clients)).toBe(true);
  });

  it('returns an explicit untouched remainder rather than claiming a full run after budget exhaustion',async()=>{
    const {clients,calls}=env();
    const clock=vi.spyOn(Date,'now').mockImplementationOnce(()=>0).mockImplementation(()=>25000);
    try{
      const output=body(await bulk(args({confirm:true}),clients)).details;
      expect(output.results.map(x=>x.status)).toEqual(['not_attempted','not_attempted']);
      expect(output.counts.not_attempted).toBe(2);
      expect(calls.filter(x=>x.path==='admin.members.insert')).toEqual([]);
    }finally{clock.mockRestore();}
  });

  it('blocks denied bulk tools through workspace_call, not only direct entry and read-only batch',async()=>{
    const {clients,calls}=env();
    clients.rtcPolicy={profile:'read_only'};
    const result=await registry.handlers.workspace_call({name:'workspace_bulk_operation',args:args({confirm:true})},clients);
    expect(result.isError).toBe(true);
    expect(calls.filter(x=>x.path==='admin.members.insert')).toEqual([]);
  });
});

describe('P7-8 complete published contract and aggregate audit', () => {
  it('publishes a strict schema for all seven exact operation parameter sets',()=>{
    const schema=registry.tools.find(x=>x.name==='workspace_bulk_operation').inputSchema;
    expect(schema.allOf).toHaveLength(7);
    expect(schema.allOf.map(x=>x.if.properties.operation.const)).toEqual([
      'set_signature','set_vacation','add_group_member','remove_group_member',
      'assign_license','change_license','remove_license'
    ]);
    for(const entry of schema.allOf){
      const parameters=entry.then.properties.parameters;
      expect(parameters.additionalProperties).toBe(false);
      expect(parameters.required).toEqual(expect.any(Array));
      expect(Object.keys(parameters.properties).length).toBeGreaterThan(0);
    }
    const mailbox=schema.allOf.find(x=>x.if.properties.operation.const==='set_vacation');
    expect(mailbox.then.properties.parameters.properties.vacation.additionalProperties).toBe(false);
    expect(mailbox.then.properties.parameters.properties.vacation.required).toEqual(['enableAutoReply']);
  });

  it('includes exact shared intended changes in the one combined preview without writes',async()=>{
    const {clients,calls}=env();
    const response=body(await bulk(args({parameters:{groupKey:'staff@example.test',role:'OWNER'},dryRun:true}),clients));
    expect(response.details).toMatchObject({
      operation:'add_group_member',parameters:{groupKey:'staff@example.test',role:'OWNER'},
      total:2,status:'preview',counts:{preview:2}
    });
    expect(calls.filter(x=>x.path==='admin.members.insert')).toEqual([]);
  });

  it('does not mark the aggregate complete if the parent audit fails after valid child receipts',async()=>{
    const {clients}=env();
    const original=holder.db.recordChange.bind(holder.db);
    holder.db.recordChange=async function(change){
      if(change.tool==='workspace_bulk_operation')throw Error('audit unavailable');
      return original(change);
    };
    const output=body(await bulk(args({confirm:true}),clients));
    expect(output.logged).toBe(false);
    expect(output.auditFailure).toBe(true);
    expect(output.details.status).toBe('incomplete');
    expect(output.details.aggregateAuditFailure).toBe(true);
    expect(output.details.reason).toBe('bulk_audit_unavailable');
    expect(output.details.counts.confirmed).toBe(2); // real child evidence is not erased
    expect(output.details.results.map(x=>x.status)).toEqual(['confirmed','confirmed']);
  });

  it('treats an encoded child error after dispatch as unknown, not proved-not-written',async()=>{
    const {clients}=env();
    const target=registry.handlers.admin_add_group_member;
    // The final composed registry is mutable only within this isolated test,
    // and the handler reference is restored even if the assertion fails.
    registry.handlers.admin_add_group_member=inheritGuardedWrite(target,async()=>({isError:true,content:[{type:'text',text:'redacted'}]}));
    try{
      const result=body(await bulk(args({confirm:true}),clients)).details;
      expect(result.results.map(x=>x.status)).toEqual(['unknown','unknown']);
      expect(result.status).toBe('incomplete');
    }finally{registry.handlers.admin_add_group_member=target;}
  });
});
