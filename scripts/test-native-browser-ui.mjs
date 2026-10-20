// Chromium fixture only. All app-origin traffic is fulfilled locally, never sent live.
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startCrossSiteForms,ORIGIN} from './v1-live-csrf-browser.mjs';
import {clientScript} from './native-browser-client.mjs';
const source='a'.repeat(40),csrf='fixture-private-token-00000000000000000000';
const forms=await startCrossSiteForms(),browser=await chromium.launch({headless:true});
try{
 const context=await browser.newContext();
 let active=true,forged=0,logout=0,breakCross=false;const requests=[];
 await context.route(ORIGIN+'/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname,form=new URLSearchParams(req.postData()||'');
  requests.push({path,method:req.method()});
  const reply=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'cache-control':'no-store'}});
  if(path==='/api/contract')return reply(200,{deployment:{sourceRevision:source}});
  if(path==='/api/auth/session')return reply(active?200:401,active?{authenticated:true,principal:{kind:'user',id:'fixture-private-principal'},csrf,linkedAccounts:[{email:'chris.tcr.2012@gmail.com'}]}:{error:'no_session'});
  if(req.method()==='GET'&&path==='/api/account')return route.fulfill({contentType:'text/html',body:'<!doctype html><title>LOCAL FIXTURE ONLY</title><h1>Fixture account</h1>'});
  if(req.method()==='POST'&&['/api/account','/api/auth/logout'].includes(path)){
   if(form.get('csrf')!==csrf){forged++;return reply(403,{error:breakCross?'fixture_wrong_error':path==='/api/account'?'invalid_session_or_scope':'invalid_session_or_csrf'});}
   assert.equal(active,true);
   if(path==='/api/account'){assert.equal(form.get('action'),'delete_preview');return reply(200,{previewOnly:true,deleted:false,accounts:1,agent_connections:2,sessions:1});}
   active=false;logout++;return reply(200,{loggedOut:true,agentConnectionsRevoked:false});
  }
  throw Error('unexpected_fixture_request');
 });
 const page=await context.newPage();page.setDefaultTimeout(15000);
 await page.goto(ORIGIN+'/api/account');
 await page.evaluate(clientScript(forms.origin,source));
 await page.getByRole('button',{name:'1. Check refused requests',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Four authenticated refusals passed.'}).waitFor();
 for(const kind of ['preview','logout'])for(const variant of ['missing','wrong']){
  const popupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Check cross-site '+kind+' / '+variant,exact:true}).click();
  const child=await popupPromise;
  await child.getByRole('button',{name:'Submit invalid CSRF test',exact:true}).click();
  // This proves the actual parent can observe navigation HTTP403 after a cross-site form.
  await page.getByRole('status').filter({hasText:'Cross-site refusal confirmed.'}).waitFor();
 }
 await page.getByRole('button',{name:'2. Log out and finish (also safe if incomplete)',exact:true}).click();
 await page.getByRole('status').filter({hasText:'This browser check passed and logged out.'}).waitFor();
 const report=JSON.parse(await page.getByRole('textbox',{name:'Sanitized check report'}).inputValue());
 assert.equal(report.result,'PASS_NATIVE_BROWSER_CSRF_SESSION');assert.equal(report.sameOrigin.length,4);assert.equal(report.crossSite.length,4);
 assert.deepEqual(report.cleanup,{loggedOut:true,agentConnectionsRevoked:false,anonymousAfterward:true});
 assert.equal(forged,8);assert.equal(logout,1);assert.equal(active,false);
 assert.ok(!JSON.stringify(report).includes(csrf));assert.ok(!JSON.stringify(report).includes('fixture-private-principal'));
 // A failed retry of a previously passed case must invalidate that old receipt.
 active=true;
 await page.reload();await page.evaluate(clientScript(forms.origin,source));
 await page.getByRole('button',{name:'1. Check refused requests',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Four authenticated refusals passed.'}).waitFor();
 for(const kind of ['preview','logout'])for(const variant of ['missing','wrong']){
  const popupPromise=page.waitForEvent('popup');
  await page.getByRole('button',{name:'Check cross-site '+kind+' / '+variant,exact:true}).click();
  const child=await popupPromise;
  await child.getByRole('button',{name:'Submit invalid CSRF test',exact:true}).click();
  await page.getByRole('status').filter({hasText:'Cross-site refusal confirmed.'}).waitFor();
 }
 breakCross=true;
 const retryPopup=page.waitForEvent('popup');
 await page.getByRole('button',{name:'Check cross-site preview / missing',exact:true}).click();
 await (await retryPopup).getByRole('button',{name:'Submit invalid CSRF test',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Check incomplete: unexpected_cross_site_response.'}).waitFor();
 const retryReport=JSON.parse(await page.getByRole('textbox',{name:'Sanitized check report'}).inputValue());
 assert.equal(retryReport.crossSite.length,3);assert.equal(retryReport.result,'INCOMPLETE');
 // Incomplete checks must still permit safe logout, without producing a pass.
 await page.getByRole('button',{name:'2. Log out and finish (also safe if incomplete)',exact:true}).click();
 await page.getByRole('status').filter({hasText:'Logged out safely; checks remain incomplete.'}).waitFor();
 const incomplete=JSON.parse(await page.getByRole('textbox',{name:'Sanitized check report'}).inputValue());
 assert.equal(incomplete.result,'INCOMPLETE');assert.equal(incomplete.cleanup.loggedOut,true);assert.equal(logout,2);
 await context.close();
 console.log('PASS_CHROMIUM_LOCAL_FIXTURE: eight refused requests, cross-site popup status/body, sanitized report and complete/incomplete logout. NO LIVE GOOGLE EVIDENCE.');
}finally{await browser.close();await forms.close();}
