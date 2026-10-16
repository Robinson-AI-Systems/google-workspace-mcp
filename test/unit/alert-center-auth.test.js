import {afterEach,describe,it,expect,vi} from 'vitest';
import {google} from 'googleapis';
import {buildApiClients} from '../../src/auth/google-auth-hosted.js';
import {buildAlertCenterAuth,ALERT_CENTER_SCOPE,DELEGATED_SCOPES} from '../../src/auth/service-account.js';
import {handlers as workflows} from '../../src/tools/workflows.js';
import {handlers} from '../../src/tools/admin-directory.js';
const env={...process.env};
afterEach(()=>{process.env={...env};vi.restoreAllMocks();});
function configure(){
 process.env.GOOGLE_ALERT_CENTER_DELEGATION_ENABLED='true';
 process.env.GOOGLE_SERVICE_ACCOUNT_JSON=JSON.stringify({client_email:'robot@example.test',private_key:'synthetic-key'});
}
describe('Alert Center service-account contract',()=>{
 it('refuses without independent opt-in, without touching user OAuth',()=>{
  delete process.env.GOOGLE_ALERT_CENTER_DELEGATION_ENABLED;
  const request=vi.fn();const clients=buildApiClients({actingAs:'admin@example.test',request});
  expect(()=>clients.alertcenter).toThrow(/separately authorized/);expect(request).not.toHaveBeenCalled();
  expect(DELEGATED_SCOPES).not.toContain(ALERT_CENTER_SCOPE);
 });
 it('keeps security snapshot honest when lazy Alert Center configuration is absent',async()=>{
  delete process.env.GOOGLE_ALERT_CENTER_DELEGATION_ENABLED;
  const clients={admin:{users:{list:async()=>({data:{users:[]}})}}};
  Object.defineProperty(clients,'alertcenter',{get(){throw new Error('delegation not configured');}});
  const result=JSON.parse((await workflows.workflow_security_snapshot({},clients)).content[0].text);
  expect(result.alertsReadable).toBe(false);expect(result.recentAlerts).toEqual([]);
  expect(result.coverage.alertCenterComplete).toBe(false);
 });
 it('requests only apps.alerts for the selected administrator',()=>{
  configure();const auth=buildAlertCenterAuth(' Admin@Example.test ');
  expect(auth.subject).toBe('admin@example.test');expect(auth.email).toBe('robot@example.test');
  expect(auth.scopes).toEqual([ALERT_CENTER_SCOPE]);
  expect(()=>buildAlertCenterAuth('')).toThrow(/administrator/);
 });
 it('runs list/get through the actual generated service and preserves provider refusal',async()=>{
  configure();const calls=[];
  const request=vi.spyOn(google.auth.JWT.prototype,'request').mockImplementation(async options=>{
   calls.push(options);return {data:options.url.endsWith('/alerts')?{alerts:[{alertId:'synthetic'}]}:{alertId:'synthetic'}};
  });
  const userRequest=vi.fn();const clients=buildApiClients({actingAs:'admin@example.test',request:userRequest});
  await handlers.admin_list_alerts({pageSize:1},clients);
  await handlers.admin_get_alert({alertId:'synthetic'},clients);
  expect(calls.map(x=>x.url)).toEqual(['https://alertcenter.googleapis.com/v1beta1/alerts','https://alertcenter.googleapis.com/v1beta1/alerts/synthetic']);
  expect(calls[0].params.pageSize).toBe(1);expect(userRequest).not.toHaveBeenCalled();
  const denied=Object.assign(new Error('delegation denied'),{code:403});request.mockRejectedValue(denied);
  await expect(handlers.admin_get_alert({alertId:'synthetic'},clients)).rejects.toBe(denied);
 });
});
