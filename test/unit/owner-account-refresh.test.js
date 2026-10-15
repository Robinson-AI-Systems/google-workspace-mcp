import {describe,it,expect,vi,beforeEach} from 'vitest';
const m=vi.hoisted(()=>({get:vi.fn(),save:vi.fn(),refresh:vi.fn(),profile:vi.fn(),set:vi.fn()}));
vi.mock('../../src/db.js',()=>({getGoogleTokensFor:m.get,saveGoogleTokensFor:m.save,getDefaultGoogleAccount:vi.fn(),migrateLegacyGoogleAuth:vi.fn()}));
vi.mock('googleapis',()=>({google:{auth:{OAuth2:class{setCredentials(t){m.set(t);}refreshAccessToken(){return m.refresh();}}},gmail:()=>({users:{getProfile:m.profile}})}}));
const {refreshConnectedAccountForReadiness:run}=await import('../../src/auth/google-auth-hosted.js');
const saved={refresh_token:'fake-refresh',access_token:'fake-old',scope:'fake-existing-scope'};
const fresh=()=>({access_token:'fake-new',expiry_date:Date.now()+3600000});
beforeEach(()=>{vi.resetAllMocks();process.env.GOOGLE_OAUTH_CLIENT_ID='fake-id';process.env.GOOGLE_OAUTH_CLIENT_SECRET='fake-secret';process.env.PUBLIC_BASE_URL='https://example.test';
 m.get.mockResolvedValueOnce(saved).mockResolvedValue({access_token:'fake-new'});m.refresh.mockResolvedValue({credentials:fresh()});m.profile.mockResolvedValue({data:{emailAddress:'ops@example.test'}});});
describe('protected existing-account refresh',()=>{
 it('refreshes without new scopes, verifies the real mailbox and awaits persistent readback',async()=>{
  expect(await run(' OPS@EXAMPLE.TEST ')).toEqual({account:'ops@example.test',refreshed:true,identityVerified:true});
  expect(m.refresh).toHaveBeenCalledExactlyOnceWith();expect(m.profile).toHaveBeenCalledWith({userId:'me'});
  expect(m.save).toHaveBeenCalledWith('ops@example.test',expect.objectContaining({access_token:'fake-new'}),{source:'refresh'});
  expect(m.save.mock.invocationCallOrder[0]).toBeGreaterThan(m.profile.mock.invocationCallOrder[0]);expect(m.get).toHaveBeenCalledTimes(2);
 });
 it.each(['bad','',null])('rejects invalid account %s before token access',async a=>{await expect(run(a)).rejects.toThrow();expect(m.get).not.toHaveBeenCalled();});
 it('does not start new consent for absent saved refresh grants',async()=>{m.get.mockReset().mockResolvedValue({access_token:'fake'});await expect(run('ops@example.test')).rejects.toThrow();expect(m.refresh).not.toHaveBeenCalled();});
 it.each([{},{access_token:'fake-new',expiry_date:0},{expiry_date:Date.now()+3600000}])('refuses malformed/expired Google refresh %j',async credentials=>{m.refresh.mockResolvedValue({credentials});await expect(run('ops@example.test')).rejects.toThrow();expect(m.save).not.toHaveBeenCalled();});
 it('does not persist a different Google mailbox',async()=>{m.profile.mockResolvedValue({data:{emailAddress:'foreign@example.test'}});await expect(run('ops@example.test')).rejects.toThrow();expect(m.save).not.toHaveBeenCalled();});
 it('does not report success when storage fails or readback differs',async()=>{m.save.mockRejectedValueOnce(Error('storage'));await expect(run('ops@example.test')).rejects.toThrow();m.get.mockReset().mockResolvedValueOnce(saved).mockResolvedValue({access_token:'fake-other'});await expect(run('ops@example.test')).rejects.toThrow();});
 it('does not persist provider-denied refreshes',async()=>{m.refresh.mockRejectedValue(Error('invalid_grant'));await expect(run('ops@example.test')).rejects.toThrow();expect(m.save).not.toHaveBeenCalled();});
});
