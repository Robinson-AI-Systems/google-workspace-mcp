import {describe,it,expect} from 'vitest';
import {Script} from 'node:vm';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {clientScript,negatives,popupRefusal,counts} from '../../scripts/native-browser-client.mjs';
import {prepare} from '../../scripts/v1-native-browser-check.mjs';
const email='pilot@example.test',csrf='private-csrf-never-in-receipts-0000000000';
const response=(status,value)=>({status,json:async()=>value});
function fixture({anonymous=false,wrongIdentity=false,mutate=false,acceptForgery=false}={}){
 let previews=0;const calls=[];
 const request=async(path,form)=>{
  calls.push({path,form});
  if(path==='/api/auth/session')return response(anonymous?401:200,{authenticated:true,principal:{kind:'user',id:'private-principal'},csrf,linkedAccounts:[{email:wrongIdentity?'other@example.test':email}]});
  if(form.csrf===csrf)return response(200,{previewOnly:true,deleted:false,accounts:1,agent_connections:2,sessions:mutate?++previews:1});
  return response(acceptForgery?200:403,{error:path==='/api/account'?'invalid_session_or_scope':'invalid_session_or_csrf'});
 };
 return {request,calls};
}
describe('native browser controlled helper; no live Google evidence',()=>{
 it('checks four real request shapes, retains own session and emits no private session data',async()=>{
  const {request,calls}=fixture(),receipts=[];
  await negatives(request,email,x=>receipts.push(x));
  expect(receipts).toHaveLength(4);
  expect(receipts.every(x=>x.http===403&&x.sessionSurvived&&x.previewUnchanged)).toBe(true);
  const forged=calls.filter(x=>x.form&&x.form.csrf!==csrf);
  expect(forged).toHaveLength(4);
  expect(forged.filter(x=>!('csrf' in x.form))).toHaveLength(2);
  expect(JSON.stringify(receipts)).not.toContain(csrf);
  expect(JSON.stringify(receipts)).not.toContain('private-principal');
 });
 it.each([
  [{anonymous:true},'sign_in_required'],[{wrongIdentity:true},'expected_account_not_signed_in'],
  [{mutate:true},'session_or_preview_changed'],[{acceptForgery:true},'invalid_request_not_refused']
 ])('fails closed on denied prerequisites, accepted forgery or mutation: %j',async(options,error)=>{
  const {request,calls}=fixture(options);
  await expect(negatives(request,email,()=>{})).rejects.toThrow(error);
  if(options.anonymous||options.wrongIdentity)expect(calls.some(x=>x.form)).toBe(false);
 });
 it('rejects deleting or malformed preview counts',()=>{
  expect(()=>counts({previewOnly:true,deleted:true})).toThrow('preview_not_safe');
  expect(()=>counts({previewOnly:true,deleted:false,accounts:1,sessions:'1',agent_connections:1})).toThrow('preview_counts_invalid');
 });
 it('requires an observable 403 navigation and exact error; retries cross-origin/loading documents',()=>{
  const canonical='https://example.test',path='/api/account';
  const child={location:{origin:canonical,pathname:path},document:{readyState:'complete',body:{innerText:'{"error":"invalid_session_or_scope"}'}},performance:{getEntriesByType:()=>[{responseStatus:403}]}};
  expect(popupRefusal(child,canonical,path)).toEqual({http:403});
  child.performance.getEntriesByType=()=>[{responseStatus:0}];
  expect(()=>popupRefusal(child,canonical,path)).toThrow('navigation_status_unverified');
  child.document.readyState='loading';expect(popupRefusal(child,canonical,path)).toBeNull();
  expect(popupRefusal({get location(){throw new DOMException('cross origin','SecurityError');}},canonical,path)).toBeNull();
 });
 it('generates syntactically valid static code only for the fixed app and loopback server',()=>{
  const code=clientScript('http://127.0.0.1:12345','a'.repeat(40));
  expect(()=>new Script(code)).not.toThrow();
  expect(code).not.toContain('document.cookie');expect(code).not.toContain('localStorage');
  expect(code).toContain('simultaneousIndependentContexts');
  expect(()=>clientScript('https://other.test','a'.repeat(40))).toThrow();
  expect(()=>clientScript('http://127.0.0.1:12345','main')).toThrow();
 });
 it('starts loopback-only forms and writes a credential-free snippet without contacting the app',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'native-check-'));let run;
  try{
   run=await prepare('a'.repeat(40),directory);
   const html=await (await fetch(run.origin+'/preview/missing')).text();
   expect(html).toContain('action="https://google-workspace-mcp-chris-projects-de6cd1bf.vercel.app/api/account"');
   expect(html).not.toContain('name="csrf"');
   expect((await fetch(run.origin+'/unknown')).status).toBe(404);
   expect(await readFile(run.snippet,'utf8')).toContain(run.origin);
  }finally{await run?.close();await rm(directory,{recursive:true,force:true});}
 });
});
