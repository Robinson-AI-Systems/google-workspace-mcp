import { describe, it, expect } from 'vitest';
import { buildApiClients, getGoogleAuthUrl } from '../../src/auth/google-auth-hosted.js';
import {handlers as gmailHandlers} from '../../src/tools/gmail.js';
import { handlers as directoryHandlers } from '../../src/tools/admin-directory.js';
import {handlers as extraHandlers} from '../../src/tools/extra-admin-apis.js';
import { handlers as policyHandlers } from '../../src/tools/policy-audit.js';

describe('hosted Google API clients', () => {
  it('keeps the exact synthetic label and page bound in the real Gmail history request',async()=>{
    const calls=[];
    const clients=buildApiClients({request:async options=>{calls.push(options);return {data:{historyId:'123',history:[]}};}});
    await gmailHandlers.gmail_list_history({startHistoryId:'120',labelId:'Label_synthetic',maxResults:10},clients);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({url:'https://gmail.googleapis.com/gmail/v1/users/me/history',params:{startHistoryId:'120',labelId:'Label_synthetic',maxResults:10}});
    for(const args of [{maxResults:0},{maxResults:101},{maxResults:'1'},{labelId:''},{labelId:' Label_synthetic'}])
      await expect(gmailHandlers.gmail_list_history({startHistoryId:'120',...args},clients)).rejects.toThrow('invalid_args');
    expect(calls).toHaveLength(1);
  });
  it('uses exact real SDK ChromeOS and REST transfer GET contracts without creating resources',async()=>{
    const calls=[];const auth={request:async o=>{calls.push(o);return {data:{deviceId:'synthetic-device',id:'synthetic-transfer',overallTransferStatusCode:'completed'}};}};
    const clients=buildApiClients(auth);
    await directoryHandlers.admin_get_chrome_device({deviceId:'synthetic-device'},clients);
    await extraHandlers.datatransfer_get_transfer_status({transferId:'synthetic-transfer'},clients);
    expect(calls.map(x=>x.url)).toEqual([
      'https://admin.googleapis.com/admin/directory/v1/customer/my_customer/devices/chromeos/synthetic-device',
      'https://admin.googleapis.com/admin/datatransfer/v1/transfers/synthetic-transfer'
    ]);
    const denied=Object.assign(new Error('not found'),{code:404});auth.request=async()=>{throw denied;};
    await expect(extraHandlers.datatransfer_get_transfer_status({transferId:'synthetic-transfer'},clients)).rejects.toBe(denied);
    await expect(directoryHandlers.admin_get_chrome_device({deviceId:'synthetic-device'},clients)).rejects.toBe(denied);
  });
  it('honors the owner-selected transfer read bound through the actual REST adapter',async()=>{
    const calls=[];
    const clients=buildApiClients({request:async options=>{calls.push(options);return {data:{dataTransfers:[]}};}});
    expect(JSON.parse((await extraHandlers.datatransfer_list_transfers({maxResults:1},clients)).content[0].text)).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({url:'https://admin.googleapis.com/admin/datatransfer/v1/transfers',params:{customerId:'my_customer',maxResults:1}});
    for(const maxResults of [0,101,1.5,'1',null])
      await expect(extraHandlers.datatransfer_list_transfers({maxResults},clients)).rejects.toThrow('maxResults');
    expect(calls).toHaveLength(1);
  });
  it('normalizes the observed omitted membership bool while refusing malformed/provider errors',async()=>{
    const run=async(data,status=200)=>extraHandlers.identity_check_membership({groupEmail:'group@example.test',userEmail:'member@example.test'},
      {cloudidentity:{groups:{lookup:async()=>({data:{name:'groups/fake'}}),memberships:{checkTransitiveMembership:async()=>({data,status})}}}});
    for(const [input,expected] of [[{},false],[{hasMembership:false},false],[{hasMembership:true},true]]){
      expect(JSON.parse((await run(input)).content[0].text)).toEqual({hasMembership:expected});
    }
    for(const value of [null,[],{error:'denied'},{other:true},{hasMembership:'false'},{hasMembership:null}])
      await expect(run(value)).rejects.toThrow('unverifiable membership');
    await expect(run({},403)).rejects.toThrow('unverifiable membership');
  });
  it('recovers Tasks read access without requesting Vault or other new scopes',()=>{
    const before={...process.env};
    try{
      process.env.PUBLIC_BASE_URL='https://workspace.example.test';
      process.env.GOOGLE_OAUTH_CLIENT_ID='fake-client';process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';
      const url=new URL(getGoogleAuthUrl('tasks-state','ops@example.test','tasks_read'));
      expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/tasks.readonly');
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      expect(url.searchParams.get('state')).toBe('tasks-state');
      expect(url.searchParams.get('login_hint')).toBe('ops@example.test');
      expect(url.searchParams.get('access_type')).toBe('offline');
    }finally{process.env=before;}
  });
  it('recovers already-approved Postmaster reads without requesting write or unrelated scopes',()=>{
    const before={...process.env};
    try{
      process.env.PUBLIC_BASE_URL='https://workspace.example.test';
      process.env.GOOGLE_OAUTH_CLIENT_ID='fake-client';process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';
      const url=new URL(getGoogleAuthUrl('postmaster-state','ops@example.test','postmaster_read'));
      expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/postmaster.readonly');
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      expect(url.searchParams.get('state')).toBe('postmaster-state');
      expect(url.searchParams.get('login_hint')).toBe('ops@example.test');
      expect(url.searchParams.get('access_type')).toBe('offline');
    }finally{process.env=before;}
  });
  it('requests only the approved v2 replacement and retained completion scopes',()=>{
    const before={...process.env};
    try{
      process.env.PUBLIC_BASE_URL='https://workspace.example.test';
      process.env.GOOGLE_OAUTH_CLIENT_ID='fake-client';process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';
      const url=new URL(getGoogleAuthUrl('v2-state','ops@example.test','postmaster_v2_read'));
      expect(url.searchParams.get('scope').split(' ')).toEqual([
        'https://www.googleapis.com/auth/tasks.readonly',
        'https://www.googleapis.com/auth/siteverification',
        'https://www.googleapis.com/auth/postmaster.domain',
        'https://www.googleapis.com/auth/postmaster.traffic.readonly'
      ]);
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      expect(url.searchParams.get('state')).toBe('v2-state');
      expect(url.searchParams.get('login_hint')).toBe('ops@example.test');
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(new URL(getGoogleAuthUrl('old','ops@example.test','standard')).searchParams.get('scope')).not.toMatch(/postmaster\.domain|postmaster\.traffic/);
    }finally{process.env=before;}
  });
  it('requests the three already approved completion permissions together without changing isolated purposes',()=>{
    const before={...process.env};
    try{
      process.env.PUBLIC_BASE_URL='https://workspace.example.test';
      process.env.GOOGLE_OAUTH_CLIENT_ID='fake-client';process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';
      const url=new URL(getGoogleAuthUrl('completion-state','ops@example.test','completion_read'));
      expect(url.searchParams.get('scope').split(' ')).toEqual([
        'https://www.googleapis.com/auth/tasks.readonly',
        'https://www.googleapis.com/auth/siteverification',
        'https://www.googleapis.com/auth/postmaster.readonly'
      ]);
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      expect(url.searchParams.get('state')).toBe('completion-state');
      expect(url.searchParams.get('login_hint')).toBe('ops@example.test');
      expect(url.searchParams.get('access_type')).toBe('offline');
      expect(url.searchParams.get('scope')).not.toMatch(/ediscovery|tasks\s|gmail\.modify|drive/);
      expect(new URL(getGoogleAuthUrl('old','ops@example.test','tasks_read')).searchParams.get('scope')).toBe('https://www.googleapis.com/auth/tasks.readonly');
      expect(new URL(getGoogleAuthUrl('old','ops@example.test','siteverification_read')).searchParams.get('scope')).toBe('https://www.googleapis.com/auth/siteverification');
      expect(new URL(getGoogleAuthUrl('old','ops@example.test','postmaster_read')).searchParams.get('scope')).toBe('https://www.googleapis.com/auth/postmaster.readonly');
      expect(new URL(getGoogleAuthUrl('old','ops@example.test','standard')).searchParams.get('scope')).not.toContain('siteverification');
    }finally{process.env=before;}
  });
  it('isolates specifically approved Site Verification consent from every other scope set',()=>{
    const before={...process.env};
    try{
      process.env.PUBLIC_BASE_URL='https://workspace.example.test';
      process.env.GOOGLE_OAUTH_CLIENT_ID='fake-client';process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';
      const url=new URL(getGoogleAuthUrl('site-state','ops@example.test','siteverification_read'));
      expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/siteverification');
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      expect(url.searchParams.get('state')).toBe('site-state');
      expect(url.searchParams.get('login_hint')).toBe('ops@example.test');
      expect(url.searchParams.get('access_type')).toBe('offline');
    }finally{process.env=before;}
  });
  it('offers only three incremental catalog read scopes through a separate purpose',()=>{
    const before={...process.env};
    try{
      process.env.PUBLIC_BASE_URL='https://workspace.example.test';
      process.env.GOOGLE_OAUTH_CLIENT_ID='fake-client';process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';
      const url=new URL(getGoogleAuthUrl('state','ops@example.test','catalog_read'));
      expect(url.searchParams.get('scope').split(' ')).toEqual([
        'https://www.googleapis.com/auth/cloud-identity.groups.readonly',
        'https://www.googleapis.com/auth/chrome.management.policy.readonly',
        'https://www.googleapis.com/auth/chat.memberships.readonly'
      ]);
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      for(const purpose of ['standard','acceptance_read','policy_read']){
        const scopes=new URL(getGoogleAuthUrl('state','ops@example.test',purpose)).searchParams.get('scope');
        expect(scopes).not.toMatch(/cloud-identity.groups|chrome.management.policy|chat.memberships/);
      }
    }finally{process.env=before;}
  });
  it('uses the pinned Chrome SDK required parent in schema-list requests',async()=>{
    const requests=[];
    const clients=buildApiClients({request:async options=>{requests.push(options);return {data:{policySchemas:[]}};}});
    const result=JSON.parse((await extraHandlers.chrome_list_policy_schemas({filter:'schemaName=chrome.users.*'},clients)).content[0].text);
    expect(result).toEqual([]);expect(requests).toHaveLength(1);
    expect(requests[0].method).toBe('GET');
    expect(requests[0].url).toContain('/v1/customers/my_customer/policySchemas');
    expect(requests[0].params.filter).toBe('schemaName=chrome.users.*');
  });

  it('requests the exact four incremental acceptance-read scopes without write scopes',()=>{
    const before={...process.env};
    try{
      process.env.PUBLIC_BASE_URL='https://workspace.example.test';
      process.env.GOOGLE_OAUTH_CLIENT_ID='fake-client';process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';
      const url=new URL(getGoogleAuthUrl('fake-state','ops@example.test','acceptance_read'));
      expect(url.searchParams.get('scope').split(' ')).toEqual([
        'https://www.googleapis.com/auth/tasks.readonly',
        'https://www.googleapis.com/auth/userinfo.profile',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/ediscovery.readonly'
      ]);
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      expect(url.searchParams.get('state')).toBe('fake-state');
      expect(url.searchParams.get('login_hint')).toBe('ops@example.test');
      expect(url.searchParams.get('access_type')).toBe('offline');
    }finally{process.env=before;}
  });
  it('requests only incremental policy read consent, retaining the standard enrollment route', () => {
    const before = {...process.env};
    try {
      process.env.PUBLIC_BASE_URL='https://workspace.example.test';
      process.env.GOOGLE_OAUTH_CLIENT_ID='fake-client';
      process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';
      const url=new URL(getGoogleAuthUrl('fake-state','ops@example.test','policy_read'));
      expect(url.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/cloud-identity.policies.readonly');
      expect(url.searchParams.get('include_granted_scopes')).toBe('true');
      expect(url.searchParams.get('login_hint')).toBe('ops@example.test');
      expect(url.searchParams.get('state')).toBe('fake-state');
      expect(new URL(getGoogleAuthUrl('fake-state')).searchParams.get('scope')).toContain('https://www.googleapis.com/auth/gmail.modify');
      expect(()=>getGoogleAuthUrl('fake-state',undefined,'arbitrary')).toThrow(/purpose/);
    } finally {process.env=before;}
  });
  it('runs the policy audit through the real hosted factory and exact read-only REST request', async () => {
    const requests = [];
    const clients = buildApiClients({actingAs:'ops@example.test',request:async options => {
      requests.push(options);
      return {data: requests.length === 1 ? {policies:[],nextPageToken:'next'} : {policies:[]}};
    }});
    expect(clients.cloudidentity.groups.memberships).toBeTruthy();
    const result = await policyHandlers.identity_policy_audit({domain:'example.test'},clients);
    const report = JSON.parse(result.content[0].text);
    expect(report).toMatchObject({complete:true,pagesRead:2,policiesRead:0,effective:false});
    expect(report.summary.notReadable).toBeGreaterThan(0);
    expect(requests).toEqual([
      {url:'https://cloudidentity.googleapis.com/v1/policies',method:'GET',params:{filter:'customer == "customers/my_customer"',pageSize:100}},
      {url:'https://cloudidentity.googleapis.com/v1/policies',method:'GET',params:{filter:'customer == "customers/my_customer"',pageSize:100,pageToken:'next'}}
    ]);
    expect(Object.keys(clients.cloudidentity.policies)).toEqual(['list']);
  });
  it('preserves real OAuth permission failures from the policy transport', async () => {
    const denied = Object.assign(new Error('insufficient authentication scopes'), {code:403});
    const clients = buildApiClients({request:async () => {throw denied;}});
    await expect(policyHandlers.identity_policy_audit({domain:'example.test'},clients)).rejects.toBe(denied);
  });
  it('sends explicit JSON through the real generated Groups Settings client for reads and patches', async () => {
    const requests = [];
    const group = {email:'fixture@example.test',whoCanJoin:'INVITED_CAN_JOIN'};
    const clients = buildApiClients({actingAs:'ops@example.test',request:async options => {
      requests.push(options);return {data:group};
    }});
    expect((await clients.groupssettings.groups.get({groupUniqueId:group.email})).data).toEqual(group);
    await clients.groupssettings.groups.patch({groupUniqueId:group.email,requestBody:{whoCanJoin:group.whoCanJoin}});
    expect(requests.map(r => r.method)).toEqual(['GET','PATCH']);
    for (const request of requests) {
      expect(request.params.alt).toBe('json');
      expect(new URL(request.url).hostname).toBe('www.googleapis.com');
      expect(new URL(request.url).pathname).toContain('/groups/v1/groups/');
    }
  });
  it('keeps service clients lazy until a tool actually uses them', () => {
    const auth = { actingAs: 'ops@example.test' };
    const clients = buildApiClients(auth);

    expect(clients.auth).toBe(auth);
    expect(clients.actingAs).toBe('ops@example.test');

    const gmailBefore = Object.getOwnPropertyDescriptor(clients, 'gmail');
    const driveBefore = Object.getOwnPropertyDescriptor(clients, 'drive');
    const vaultBefore = Object.getOwnPropertyDescriptor(clients, 'vault');
    expect(gmailBefore?.get).toBeTypeOf('function');
    expect(driveBefore?.get).toBeTypeOf('function');
    expect(vaultBefore?.get).toBeTypeOf('function');

    const gmail = clients.gmail;
    expect(gmail).toBeTruthy();

    const gmailAfter = Object.getOwnPropertyDescriptor(clients, 'gmail');
    const driveAfter = Object.getOwnPropertyDescriptor(clients, 'drive');
    expect(gmailAfter?.get).toBeUndefined();
    expect(gmailAfter?.value).toBe(gmail);
    expect(driveAfter?.get).toBeTypeOf('function');
  });

  it('enumerates lazy services without constructing them', () => {
    const clients = buildApiClients({ actingAs: 'ops@example.test' });
    expect(Object.keys(clients)).toEqual(expect.arrayContaining([
      'auth', 'actingAs', 'gmail', 'drive', 'calendar', 'admin', 'vault'
    ]));
    expect(Object.getOwnPropertyDescriptor(clients, 'calendar')?.get).toBeTypeOf('function');
  });
});
