// Opt-in real-service proof. Never attach to, import, or export a browser session.
import {createRequire} from 'node:module';
import {existsSync} from 'node:fs';
import {createInterface} from 'node:readline/promises';
import {fileURLToPath} from 'node:url';
import {createServer} from 'node:http';

export const ORIGIN='https://google-workspace-mcp-chris-projects-de6cd1bf.vercel.app';
export const REMOTE_FORM_ORIGIN='https://workspace-csrf-test.invalid';
export const PILOTS=[
 {label:'Primary',email:'chris.tcr.2012@gmail.com'},
 {label:'RAR',email:'ops@robinsonappliancerentals.com'}
];
const refuse=code=>{throw new Error(code);};
const assert=(condition,code)=>{if(!condition)refuse(code);};
const wrong='invalid-csrf-for-controlled-test-only-00000000';
export function configuration(argv){
 assert(argv.length===2&&argv[0]==='--expected-live'&&/^[a-f0-9]{40}$/.test(argv[1]),'usage_expected_live_sha');
 return {expectedSha:argv[1]};
}
export function previewCounts(body){
 assert(body?.previewOnly===true&&body.deleted===false,'not_a_nondeleting_preview');
 const values=['accounts','agent_connections','sessions'].map(key=>body[key]);
 assert(values.every(value=>Number.isSafeInteger(value)&&value>=0),'invalid_preview_counts');
 return values;
}
async function json(response,status,error){
 assert(response.status()===status,error);
 return response.json(); // Bodies stay in process memory, never in diagnostics.
}
export async function sessionAlive(context,email){
 const response=await context.request.get(ORIGIN+'/api/account',{maxRedirects:0});
 assert(response.status()===200,'authenticated_portal_required');
 assert((await response.text()).includes(email),'wrong_pilot_portal');
}
async function preview(row){
 return previewCounts(await json(await row.context.request.post(ORIGIN+'/api/account',{
  form:{action:'delete_preview',csrf:row.csrf},maxRedirects:0
 }),200,'valid_preview_failed'));
}
export async function checkNegatives(row,foreignCsrf){
 await sessionAlive(row.context,row.email);
 const before=await preview(row);
 const results=[];
 for(const [kind,csrf]of [['missing',undefined],['wrong',wrong],['crossed',foreignCsrf]]){
  for(const path of ['/api/account','/api/auth/logout']){
   const form=path==='/api/account'?{action:'delete_preview'}:{};
   if(csrf!==undefined)form.csrf=csrf;
   const body=await json(await row.context.request.post(ORIGIN+path,{form,maxRedirects:0}),403,'forged_post_not_refused');
   assert(body.error===(path==='/api/account'?'invalid_session_or_scope':'invalid_session_or_csrf'),'unexpected_refusal');
   await sessionAlive(row.context,row.email);
   assert(JSON.stringify(await preview(row))===JSON.stringify(before),'preview_changed');
   results.push({kind,path,http:403,sessionSurvived:true,previewUnchanged:true});
  }
 }
 return {label:row.label,checks:results};
}
export function crossSiteDocument(path){
 const match=/^\/(preview|logout)\/(missing|wrong)$/.exec(path);
 if(!match)return null;
 const target=match[1]==='preview'?'/api/account':'/api/auth/logout';
 return '<!doctype html><title>Controlled invalid CSRF test</title><form method="POST" action="'+ORIGIN+target+'">'+
  (match[1]==='preview'?'<input type="hidden" name="action" value="delete_preview">':'')+
  (match[2]==='wrong'?'<input type="hidden" name="csrf" value="'+wrong+'">':'')+
  '<button>Submit invalid CSRF test</button></form>';
}
export async function startCrossSiteForms(){
 const server=createServer((req,res)=>{
  const html=crossSiteDocument(req.url);
  if(req.method!=='GET'||!html){res.writeHead(404);res.end();return;}
  res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
  res.end(html);
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 return {origin:'http://127.0.0.1:'+server.address().port,
  close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
export async function checkCrossSite(row,origin){
 const before=await preview(row),checks=[];
 for(const [name,path]of [['preview','/api/account'],['logout','/api/auth/logout']]){
  for(const kind of ['missing','wrong']){
   await row.page.goto(origin+'/'+name+'/'+kind);
   const responsePromise=row.page.waitForResponse(response=>response.url()===ORIGIN+path&&response.request().method()==='POST');
   await row.page.getByRole('button',{name:'Submit invalid CSRF test',exact:true}).click();
   const body=await json(await responsePromise,403,'cross_site_post_not_refused');
   assert(body.error===(name==='preview'?'invalid_session_or_scope':'invalid_session_or_csrf'),'unexpected_cross_site_refusal');
   await sessionAlive(row.context,row.email);
   assert(JSON.stringify(await preview(row))===JSON.stringify(before),'cross_site_preview_changed');
   checks.push({kind,path,http:403,sessionSurvived:true,previewUnchanged:true});
  }
 }
 return {label:row.label,checks,scope:'real cross-site form refusal; SameSite cookie and CSRF boundary together'};
}
export async function cleanup(row){
 const response=await row.page.goto(ORIGIN+'/api/account');
 if(response?.status()===401)return 'already_anonymous';
 assert(response?.status()===200,'cleanup_portal_unavailable');
 // Use the genuine form, without serializing its credential into the request log.
 await row.page.getByRole('button',{name:'Log out of this browser (agents remain)',exact:true}).click();
 const result=JSON.parse(await row.page.locator('body').innerText());
 assert(result.loggedOut===true&&result.agentConnectionsRevoked===false,'cleanup_logout_failed');
 const after=await row.context.request.get(ORIGIN+'/api/account',{maxRedirects:0});
 assert(after.status()===401,'cleanup_session_still_active');
 return 'logged_out_agents_preserved';
}
export async function exercise(rows,crossSiteOrigin){
 const report={checks:[],crossSite:[],cleanup:[],scope:'authenticated HTTP negatives plus independently launched browser cross-site forms',
  independentDatabaseInventory:'NOT_PERFORMED',existingConnectorReadbacks:'NOT_PERFORMED',acceptance:'NOT_AUTOMATICALLY_PROMOTED'};
 try{
  assert(rows.length===2&&rows[0].csrf!==rows[1].csrf,'two_distinct_fresh_sessions_required');
  assert(/^http:\/\/127\.0\.0\.1:\d+$/.test(crossSiteOrigin||'')||crossSiteOrigin===REMOTE_FORM_ORIGIN,'controlled_cross_site_forms_required');
  for(let index=0;index<rows.length;index++){
   report.checks.push(await checkNegatives(rows[index],rows[1-index].csrf));
   report.crossSite.push(await checkCrossSite(rows[index],crossSiteOrigin));
  }
  report.result='PASS_BROWSER_CSRF_ONLY';
 }catch{
  report.result='FAIL'; // Do not expose Playwright errors, auth URLs or bodies.
 }finally{
  for(const row of rows){
   try{report.cleanup.push({label:row.label,result:await cleanup(row)});}
   catch{report.cleanup.push({label:row.label,result:'FAILED_REQUIRES_BROWSER_SESSION_CLEANUP'});report.result='FAIL';}
  }
 }
 return report;
}
async function main(argv){
 const {expectedSha}=configuration(argv);
 const {chromium}=createRequire(import.meta.url)('playwright');
 assert(existsSync(chromium.executablePath()),'standalone_chromium_not_installed');
 assert(process.platform!=='linux'||Boolean(process.env.DISPLAY||process.env.WAYLAND_DISPLAY),'interactive_display_unavailable');
 const browser=await chromium.launch({headless:false});
 const input=createInterface({input:process.stdin,output:process.stdout});
 const rows=[];
 let forms;
 let transferred=false;
 try{
  for(const pilot of PILOTS){
   const context=await browser.newContext(); // Empty ephemeral storage, no saved profile.
   const page=await context.newPage();
   const row={...pilot,context,page};rows.push(row);
   context.setDefaultTimeout(20000);
   const contract=await json(await context.request.get(ORIGIN+'/api/contract',{maxRedirects:0}),200,'contract_unavailable');
   assert(contract.deployment?.sourceRevision===expectedSha,'deployed_source_mismatch');
   await page.goto(ORIGIN+'/api/account');
   assert((await context.request.get(ORIGIN+'/api/account',{maxRedirects:0})).status()===401,'context_not_fresh');
   await page.getByRole('link',{name:'Sign in with your approved Google account',exact:true}).click();
   await input.question('Complete '+pilot.label+' identity-only Google sign-in in its browser window; press Enter here afterward. Do not type credentials here.\n');
   await page.goto(ORIGIN+'/api/account');
   await sessionAlive(context,pilot.email);
   row.csrf=await page.locator('form[action="/api/auth/logout"] input[name="csrf"]').getAttribute('value');
   assert(typeof row.csrf==='string'&&row.csrf.length>=32,'session_csrf_unavailable');
  }
  forms=await startCrossSiteForms();
  transferred=true; // exercise owns cleanup once both sign-ins and forms exist.
  const result=await exercise(rows,forms.origin);
  console.log(JSON.stringify({sourceRevision:expectedSha,observedAt:new Date().toISOString(),...result},null,2));
  if(result.result==='FAIL')process.exitCode=1;
 }finally{
  if(!transferred)for(const row of rows){
   try{console.log(JSON.stringify({label:row.label,cleanup:await cleanup(row)}));}
   catch{console.error(row.label+': FAILED_REQUIRES_BROWSER_SESSION_CLEANUP');}
  }
  await forms?.close();input.close();await browser.close();
 }
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
 main(process.argv.slice(2)).catch(error=>{
  const reason=/^[a-z_]+$/.test(error?.message||'')?error.message:'browser_or_live_check_failed';
  console.error('INCOMPLETE: '+reason+'; no acceptance pass. See the pilot card.');
  process.exitCode=2;
 });
}
