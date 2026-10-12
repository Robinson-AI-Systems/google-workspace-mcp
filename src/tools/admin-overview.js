// RTC §11: one read-only owner summary reusing the existing, guarded
// Workspace diagnostics. Settings with no supported API are explicitly not_readable.
import { ok } from './util.js';
import { allowedTool } from '../rtc/catalog.js';
const secretShape=/rtc_pass_[A-Za-z0-9_-]{43}/g;
const errors=e=>String(e?.message||e).replace(secretShape,'[redacted]').slice(0,160);
function unpack(output){
 if(output?.isError)throw new Error(output.content?.[0]?.text||'Read failed');
 const value=output?.content?.[0]?.text;
 try{return JSON.parse(value)}catch{return value};
}
const SOURCES={
 identity:{tool:'workspace_whoami',args:()=>({})},
 security:{tool:'workflow_security_snapshot',args:()=>({})},
 health:{tool:'workflow_health_report',args:clients=>({scope:String(clients.actingAs||'').split('@')[1]||'all'})},
 email:{tool:'workflow_email_health',args:clients=>({domain:String(clients.actingAs||'').split('@')[1]})},
 licenses:{tool:'workspace_plan_summary',args:()=>({})}
};
function severity(data){
 if(data?.usersWithout2StepVerification?.length||data?.recentAlerts?.length)return 'needs_attention';
 const text=typeof data==='string'?data:JSON.stringify(data);
 return /\b(FAIL|WARN|needs_attention|blocked|misconfigured)\b/i.test(text)?'needs_attention':'ok';
}
export async function buildAdminOverview(clients,call){
 const items={};
 await Promise.all(Object.entries(SOURCES).map(async([section,source])=>{
  if(!allowedTool(source.tool,clients?.rtcPolicy||{})){
   items[section]={status:'not_readable',reason:'Outside the permitted areas or connection profile.'};return;
  }
  try{
   const data=unpack(await call(source.tool,source.args(clients),clients));
   items[section]={status:severity(data),data};
  }catch(e){items[section]={status:'not_readable',reason:errors(e)};}
 }));
 items.billing_invoices={status:'not_readable',reason:'Google Workspace invoice/payment settings have no API available to this server.',
   setting:{url:'https://admin.google.com/ac/billing',steps:[{n:1,action:'Open',target:'Billing in Admin console'}],expected:'Billing page visible; no changes are made or claimed.'}};
 items.notification_settings={status:'not_readable',reason:'Some owner notification preferences require the Admin console.',
   setting:{url:'https://admin.google.com',steps:[{n:1,action:'Search',target:'Notification settings'}],expected:'Setting visible, not changed or verified.'}};
 return {account:clients?.actingAs||null,checkedAt:new Date().toISOString(),items};
}
export const tools=[{
 name:'workspace_admin_overview',
 description:'Read owner-side security, email health, identity and license status, with honest gaps for console-only settings.',
 inputSchema:{type:'object',properties:{}}
}];
export const handlers={
 async workspace_admin_overview(_args,clients){
  const {registry}=await import('./index.js');
  return ok(await buildAdminOverview(clients,(name,args,c)=>registry.handlers[name](args,c)));
 }
};
