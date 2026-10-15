import { describe, it, expect } from 'vitest';
import { buildApiClients } from '../../src/auth/google-auth-hosted.js';

describe('hosted Google API clients', () => {
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
