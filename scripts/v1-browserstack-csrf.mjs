// New BrowserStack-owned sessions only. No CDP attachment or saved storage.
import {createRequire} from 'node:module';
import {appendFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {ORIGIN,PILOTS,REMOTE_FORM_ORIGIN,crossSiteDocument,exercise,cleanup} from './v1-live-csrf-browser.mjs';
const assert=(value,code)=>{if(!value)throw new Error(code);};
const failureReasons=new Set(['new_context_not_anonymous','contract_unavailable','deployed_source_mismatch',
 'anonymous_form_refusal_failed','unexpected_form_refusal','wrong_pilot_identity','login_portal_unavailable',
 'interactive_login_timeout','session_csrf_unavailable','session_details_invalid']);
export function configuration(argv,env){
 assert(argv.length===4&&argv[0]==='--expected-live'&&/^[a-f0-9]{40}$/.test(argv[1])&&argv[2]==='--mode'&&['capability','csrf'].includes(argv[3]),'usage_expected_source_and_mode');
 assert(env.BROWSERSTACK_INCLUDED_USAGE_CONFIRMED==='true','included_usage_confirmation_required');
 assert(env.BROWSERSTACK_USERNAME&&env.BROWSERSTACK_ACCESS_KEY,'browserstack_secrets_missing');
 return {expectedSha:argv[1],mode:argv[3]};
}
export function capabilities(env,label,version){
 return {os:'Windows',os_version:'11',browser:'chrome',browser_version:'latest',
  'browserstack.username':env.BROWSERSTACK_USERNAME,'browserstack.accessKey':env.BROWSERSTACK_ACCESS_KEY,
  project:'Workspace v1 acceptance',build:'Workspace CSRF '+(env.GITHUB_RUN_ID||'manual'),name:label,
  'client.playwrightVersion':version,'browserstack.playwrightVersion':'1.latest',
  'browserstack.interactiveDebugging':true,'browserstack.video':true,
  'browserstack.debug':false,'browserstack.console':'disable','browserstack.networkLogs':false,
  'browserstack.playwrightLogs':false,'browserstack.maskCommands':'sendType,sendPress,setHTTPCredentials,setStorageState',
  'browserstack.idleTimeout':300};
}
export function dashboardUrl(details){
 const {build_hashed_id:build,hashed_id:id}=details||{};
 assert(/^[a-zA-Z0-9_-]{6,100}$/.test(build||'')&&/^[a-zA-Z0-9_-]{6,100}$/.test(id||''),'session_details_invalid');
 // Deliberately never use public_url, video_url or any provider-returned query.
 return 'https://automate.browserstack.com/builds/'+build+'/sessions/'+id;
}
export async function installCrossSiteForms(context){
 await context.route(REMOTE_FORM_ORIGIN+'/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  const html=!url.search&&request.method()==='GET'?crossSiteDocument(url.pathname):null;
  await route.fulfill({status:html?200:404,contentType:'text/html',headers:{'cache-control':'no-store'},body:html||'Not found'});
 });
}
async function sourceCheck(context,expectedSha){
 const response=await context.request.get(ORIGIN+'/api/contract',{maxRedirects:0,timeout:20000});
 assert(response.status()===200,'contract_unavailable');
 assert((await response.json()).deployment?.sourceRevision===expectedSha,'deployed_source_mismatch');
}
async function anonymous(context){
 const response=await context.request.get(ORIGIN+'/api/account',{maxRedirects:0,timeout:20000});
 assert(response.status()===401,'new_context_not_anonymous');
}
function message(text){
 console.log(text);
 if(process.env.GITHUB_STEP_SUMMARY)appendFileSync(process.env.GITHUB_STEP_SUMMARY,text+'\n\n');
}
export async function waitForPilot(row,{timeoutMs=360000,now=Date.now,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const deadline=now()+timeoutMs;
 while(now()<deadline){
  const response=await row.context.request.get(ORIGIN+'/api/account',{maxRedirects:0,timeout:20000});
  if(response.status()===200){assert((await response.text()).includes(row.email),'wrong_pilot_identity');return;}
  assert(response.status()===401,'login_portal_unavailable');
  await pause(3000);
 }
 throw new Error('interactive_login_timeout');
}
async function capabilityCheck(browser,expectedSha){
 const contexts=[];
 try{
  for(let n=0;n<2;n++){
   const context=await browser.newContext();context.setDefaultTimeout(15000);contexts.push(context);
   await anonymous(context);await sourceCheck(context,expectedSha);
  }
  const context=contexts[0];await installCrossSiteForms(context);
  const page=await context.newPage();
  await page.goto(REMOTE_FORM_ORIGIN+'/preview/missing');
  const responsePromise=page.waitForResponse(r=>r.url()===ORIGIN+'/api/account'&&r.request().method()==='POST');
  await page.getByRole('button',{name:'Submit invalid CSRF test',exact:true}).click();
  const response=await responsePromise;
  assert(response.status()===403,'anonymous_form_refusal_failed');
  assert((await response.json()).error==='invalid_session_or_scope','unexpected_form_refusal');
  for(const row of contexts)await anonymous(row);
  return {result:'PASS_REMOTE_CAPABILITIES_ONLY',freshContexts:2,crossSitePost:403,
   googleLogin:'NOT_PERFORMED',authenticatedCsrf:'NOT_PERFORMED',phoneInteractiveLogin:'NOT_VERIFIED'};
 }finally{for(const context of contexts)await context.close().catch(()=>{});}
}
export async function run({config,env,chromium,version,emit=message,waitForPilotFn=waitForPilot}){
 const rows=[],browsers=[],timers=[];
 let transferred=false,result,stage='browser_connect',budgetExpired=false;
 async function connect(label){
  const caps=capabilities(env,label,version);
  const browser=await chromium.connect({wsEndpoint:'wss://cdp.browserstack.com/playwright?caps='+encodeURIComponent(JSON.stringify(caps)),timeout:60000});
  browsers.push(browser);
  timers.push(setTimeout(async()=>{
   budgetExpired=true;emit('INCOMPLETE: browser_duration_limit');
   const row=rows.find(row=>row.browser===browser);
   if(row){
    try{emit(JSON.stringify({label:row.label,watchdogCleanup:await cleanup(row)}));}
    catch{emit(JSON.stringify({label:row.label,watchdogCleanup:'FAILED_REQUIRES_BROWSER_SESSION_CLEANUP'}));}
   }
   await browser.close().catch(()=>{});
  },config.mode==='capability'?180000:900000));
  return browser;
 }
 try{
  if(config.mode==='capability'){
   const browser=await connect('Anonymous capability check');stage='anonymous_capabilities';
   result=await capabilityCheck(browser,config.expectedSha);emit(JSON.stringify(result));return result;
  }
  for(const pilot of PILOTS){
   stage='browser_connect_'+pilot.label;
   const browser=await connect(pilot.label+' fresh identity-only session');
   const context=await browser.newContext();context.setDefaultTimeout(20000);
   const page=await context.newPage();
   const row={...pilot,context,page,browser};rows.push(row);
   stage='source_and_freshness_'+pilot.label;
   await anonymous(context);await sourceCheck(context,config.expectedSha);await installCrossSiteForms(context);
   await page.goto(ORIGIN+'/api/account');
   const details=JSON.parse(await page.evaluate(()=>{},'browserstack_executor: '+JSON.stringify({action:'getSessionDetails'})));
   const url=dashboardUrl(details);
   emit(pilot.label+': open '+url+' and Start an interactive session. Complete only the approved identity-only Google login, then Stop Interactive Session. Six-minute sign-in window.');
   timers.push(setInterval(()=>{page.title().catch(()=>{});},20000));
   stage='interactive_login_'+pilot.label;
   await page.getByRole('link',{name:'Sign in with your approved Google account',exact:true}).click();
   await waitForPilotFn(row);
   await page.goto(ORIGIN+'/api/account');
   row.csrf=await page.locator('form[action="/api/auth/logout"] input[name="csrf"]').getAttribute('value');
   assert(typeof row.csrf==='string'&&row.csrf.length>=32,'session_csrf_unavailable');
   emit(pilot.label+': expected pilot session verified; waiting for remaining test setup.');
  }
  stage='authenticated_matrix';transferred=true;
  result=await exercise(rows,REMOTE_FORM_ORIGIN);
  emit(JSON.stringify({sourceRevision:config.expectedSha,observedAt:new Date().toISOString(),
   attackerPage:'fixed reserved .invalid origin fulfilled by runner; application HTTPS is never intercepted',...result}));
  return result;
 }catch(error){
  const reason=failureReasons.has(error?.message)?error.message:'remote_operation_failed';
  result={result:'INCOMPLETE',stage,reason,acceptance:'NOT_PROMOTED'};emit(JSON.stringify(result));return result;
 }finally{
  for(const timer of timers)clearInterval(timer);
  if(budgetExpired&&result)result.result='INCOMPLETE';
  if(!transferred)for(const row of rows){
   try{emit(JSON.stringify({label:row.label,cleanup:await cleanup(row)}));}
   catch{emit(JSON.stringify({label:row.label,cleanup:'FAILED_REQUIRES_BROWSER_SESSION_CLEANUP'}));}
  }
  for(const browser of browsers){
   try{await browser.close();}
   catch{if(result)result.result='INCOMPLETE';emit('INCOMPLETE: remote_browser_close_failed');}
  }
 }
}
async function main(){
 const env=process.env,config=configuration(process.argv.slice(2),env);
 const require=createRequire(import.meta.url),{chromium}=require('playwright'),{version}=require('playwright/package.json');
 const result=await run({config,env,chromium,version});
 if(!['PASS_REMOTE_CAPABILITIES_ONLY','PASS_BROWSER_CSRF_ONLY'].includes(result.result))process.exitCode=2;
}
if(process.argv[1]===fileURLToPath(import.meta.url))main().catch(()=>{console.error('INCOMPLETE: remote_runner_configuration; no acceptance pass');process.exitCode=2;});
