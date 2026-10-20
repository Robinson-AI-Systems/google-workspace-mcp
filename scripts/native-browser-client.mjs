// Owner-run DevTools snippet: ordinary browser login, unchanged live handlers.
export function page(){
 return '<main style="max-width:46rem;margin:auto;padding:1rem;font:16px/1.5 system-ui">'+
  '<h1>Check this pilot browser session</h1><p>Use a fresh private window in regular Chrome or Edge. Sign in through your Workspace account page, then run this snippet. Run once for each approved identity.</p>'+
  '<p>These checks preview your own connection counts and test refused requests. They never delete an account or disconnect an agent. Finish logs out only this browser session.</p>'+
  '<label>Expected account <select id="identity"><option value="chris.tcr.2012@gmail.com">Primary — chris.tcr.2012@gmail.com</option>'+
  '<option value="ops@robinsonappliancerentals.com">RAR — ops@robinsonappliancerentals.com</option></select></label>'+
  '<p><button id="same">1. Check refused requests</button></p><p>Next, open each cross-site check and press its Submit button. Return to this tab after the JSON response appears.</p>'+
  ['preview','logout'].flatMap(kind=>['missing','wrong'].map(variant=>'<p><button class="cross" data-kind="'+kind+'" data-variant="'+variant+'">Check cross-site '+kind+' / '+variant+'</button></p>')).join('')+
  '<p><button id="finish">2. Log out and finish (also safe if incomplete)</button> <button id="copy">Copy sanitized report</button></p>'+
  '<p id="status" role="status">Ready. Sign in with your own approved account before running checks.</p><textarea id="report" readonly rows="18" style="width:100%" aria-label="Sanitized check report"></textarea>'+
  '</main>';
}
export function counts(value){
 if(value?.previewOnly!==true||value.deleted!==false)throw Error('preview_not_safe');
 const list=['accounts','agent_connections','sessions'].map(key=>value[key]);
 if(!list.every(x=>Number.isSafeInteger(x)&&x>=0))throw Error('preview_counts_invalid');
 return list;
}
export async function readOwn(request,email){
 const response=await request('/api/auth/session');
 if(response.status!==200)throw Error('sign_in_required');
 const value=await response.json();
 if(value.authenticated!==true||value.principal?.kind!=='user'||typeof value.principal.id!=='string'||!value.principal.id||typeof value.csrf!=='string'||value.csrf.length<32||
  !value.linkedAccounts?.some(a=>a.email?.toLowerCase()===email.toLowerCase()))throw Error('expected_account_not_signed_in');
 return {csrf:value.csrf,principal:value.principal.id};
}
export async function preview(request,state){
 const response=await request('/api/account',{action:'delete_preview',csrf:state.csrf});
 if(response.status!==200)throw Error('valid_preview_failed');
 return counts(await response.json());
}
export async function unchanged(request,email,state,before){
 const after=await readOwn(request,email);
 if(after.principal!==state.principal||JSON.stringify(await preview(request,after))!==JSON.stringify(before))throw Error('session_or_preview_changed');
}
export async function negatives(request,email,emit){
 const state=await readOwn(request,email),before=await preview(request,state);
 for(const variant of ['missing','wrong'])for(const path of ['/api/account','/api/auth/logout']){
  const form=path==='/api/account'?{action:'delete_preview'}:{};
  if(variant==='wrong')form.csrf='invalid-csrf-for-controlled-test-only-00000000';
  const response=await request(path,form),value=await response.json();
  if(response.status!==403||value.error!==(path==='/api/account'?'invalid_session_or_scope':'invalid_session_or_csrf'))throw Error('invalid_request_not_refused');
  await unchanged(request,email,state,before);
  emit({variant,path,http:403,sessionSurvived:true,previewUnchanged:true});
 }
}
export function popupRefusal(child,canonical,path){
 try{
  if(child.location.origin!==canonical||child.location.pathname!==path)return null;
  if(child.document.readyState!=='complete')return null;
  const status=child.performance.getEntriesByType('navigation')[0]?.responseStatus;
  if(status!==403)throw Error('navigation_status_unverified');
  const value=JSON.parse(child.document.body.innerText);
  if(value.error!==(path==='/api/account'?'invalid_session_or_scope':'invalid_session_or_csrf'))throw Error('unexpected_cross_site_response');
  return {http:status};
 }catch(error){
  if(error?.name==='SecurityError')return null;
  throw Error(['navigation_status_unverified','unexpected_cross_site_response'].includes(error?.message)?error.message:'cross_site_response_unverified');
 }
}
export function boot(crossOrigin,expectedSource){
 const root=document.getElementById('workspace-native-check'),$=id=>root.querySelector('#workspace-check-'+id);
 const report={kind:'native_browser_session_check',startedAt:new Date().toISOString(),result:'INCOMPLETE',sameOrigin:[],crossSite:[],
  crossedActiveSessionToken:'NOT_PERFORMED',simultaneousIndependentContexts:'NOT_PERFORMED',independentDatabaseInventory:'NOT_PERFORMED',standingConnectorReadbacks:'NOT_PERFORMED',acceptance:'NOT_AUTOMATICALLY_PROMOTED'};
 let busy=false,identity=null;
 const show=message=>{$('status').textContent=message;$('report').value=JSON.stringify(report,null,2);try{sessionStorage.setItem('workspace-native-check-receipt',$('report').value);}catch{}};
 const request=(path,form)=>fetch(path,{method:form?'POST':'GET',credentials:'same-origin',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
  ...(form?{headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)}:{})});
 const selected=()=>{const email=$('identity').value;if(identity&&identity!==email)throw Error('keep_same_identity_for_this_run');return email;};
 const begin=async()=>{
  const email=selected();await readOwn(request,email);
  {
   const response=await request('/api/contract'),value=await response.json();
   if(response.status!==200||value.deployment?.sourceRevision!==expectedSource)throw Error('source_not_verified');
   report.sourceRevision=value.deployment.sourceRevision;report.identity=email;identity=email;
  }
  return email;
 };
 const action=fn=>async event=>{
  if(busy)return;busy=true;
  root.querySelectorAll('button').forEach(button=>{button.disabled=true;});
  try{await fn(event);}catch(error){
   const allowed=['sign_in_required','expected_account_not_signed_in','source_not_verified','preview_not_safe','preview_counts_invalid','valid_preview_failed','session_or_preview_changed','invalid_request_not_refused','navigation_status_unverified','unexpected_cross_site_response','cross_site_response_unverified','keep_same_identity_for_this_run','popup_not_opened','canonical_origin_required','cross_site_check_incomplete','logout_not_confirmed','session_still_active'];
   report.lastFailure=allowed.includes(error?.message)?error.message:'request_or_browser_check_incomplete';report.result='INCOMPLETE';
   show('Check incomplete: '+report.lastFailure+'. Copy the report. Use Log out and finish for cleanup, or the account page if that fails.');
  }
  finally{busy=false;root.querySelectorAll('button').forEach(button=>{button.disabled=false;});}
 };
 $('same').onclick=action(async()=>{
  report.sameOrigin=[];show('Checking this authenticated session.');
  const email=await begin();
  await negatives(request,email,item=>{report.sameOrigin.push(item);show('Confirmed a refused request and unchanged session.');});
  show('Four authenticated refusals passed. Complete the four cross-site checks next.');
 });
 root.querySelectorAll('.cross').forEach(button=>{button.onclick=action(async()=>{
  const {kind,variant}=button.dataset,path=kind==='preview'?'/api/account':'/api/auth/logout';
  // An unsuccessful retry must invalidate its old receipt before any new work.
  report.crossSite=report.crossSite.filter(x=>x.path!==path||x.variant!==variant);
  // Open synchronously during the tap so normal popup protection need not be disabled.
  const child=window.open('about:blank','workspace-controlled-check');
  if(!child)throw Error('popup_not_opened');
  try{
   const email=await begin(),state=await readOwn(request,email),before=await preview(request,state);
   const other=crossOrigin;
   if(location.origin===other)throw Error('canonical_origin_required');
   child.location.href=other+'/'+kind+'/'+variant;
   show('In the opened tab, press Submit, then return here.');
   const deadline=Date.now()+600000;let found=false;
   while(Date.now()<deadline&&!child.closed){
    const result=popupRefusal(child,location.origin,path);
    if(result){
     await unchanged(request,email,state,before);
     report.crossSite.push({path,variant,http:403,formOrigin:other,sessionSurvived:true,previewUnchanged:true});found=true;break;
    }
    await new Promise(resolve=>setTimeout(resolve,500));
   }
   if(!found)throw Error('cross_site_check_incomplete');
   show('Cross-site refusal confirmed. Continue with any remaining check.');
  }finally{child.close();}
 });});
 $('finish').onclick=action(async()=>{
  const email=selected(),complete=report.sameOrigin.length===4&&report.crossSite.length===4;
  const state=await readOwn(request,email),response=await request('/api/auth/logout',{csrf:state.csrf}),value=await response.json();
  if(response.status!==200||value.loggedOut!==true||value.agentConnectionsRevoked!==false)throw Error('logout_not_confirmed');
  if((await request('/api/auth/session')).status!==401)throw Error('session_still_active');
  report.cleanup={loggedOut:true,agentConnectionsRevoked:false,anonymousAfterward:true};
  report.result=complete?'PASS_NATIVE_BROWSER_CSRF_SESSION':'INCOMPLETE';report.finishedAt=new Date().toISOString();
  show((complete?'This browser check passed and logged out.':'Logged out safely; checks remain incomplete.')+' Copy the report. Repeat in a fresh private window for the other approved identity.');
 });
 $('copy').onclick=()=>{navigator.clipboard.writeText($('report').value).then(()=>{$('status').textContent='Sanitized report copied.';}).catch(()=>{$('report').select();});};
 show('Ready. Start with Check refused requests.');
}
export function clientScript(crossOrigin,expectedSource){
 if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(crossOrigin)||!/^[a-f0-9]{40}$/.test(expectedSource))throw Error('invalid_local_configuration');
 const html=page().replace(/id="(identity|same|finish|copy|status|report)"/g,'id="workspace-check-$1"');
 return '(()=>{if(location.origin!=="https://google-workspace-mcp-chris-projects-de6cd1bf.vercel.app")throw Error("Open the canonical Workspace account page first");'+
  'if(document.getElementById("workspace-native-check"))throw Error("The check panel is already open");'+
  'const panel=document.createElement("div");panel.id="workspace-native-check";panel.style.cssText="position:fixed;inset:0;z-index:2147483647;background:white;color:black;overflow:auto";'+
  'panel.innerHTML='+JSON.stringify(html)+';document.body.append(panel);\n'+
  [counts,readOwn,preview,unchanged,negatives,popupRefusal,boot].map(fn=>fn.toString()).join('\n')+
  '\nboot('+JSON.stringify(crossOrigin)+','+JSON.stringify(expectedSource)+');})();';
}
