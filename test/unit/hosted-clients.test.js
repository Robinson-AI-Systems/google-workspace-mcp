import { describe, it, expect } from 'vitest';
import { buildApiClients, getGoogleAuthUrl } from '../../src/auth/google-auth-hosted.js';
import { handlers as policyHandlers } from '../../src/tools/policy-audit.js';

describe('hosted Google API clients', () => {
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
