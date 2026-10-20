import {describe,it,expect} from 'vitest';
import http from 'node:http';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {configuration,previewCounts,checkNegatives,exercise,startCrossSiteForms,ORIGIN} from '../../scripts/v1-live-csrf-browser.mjs';

const response=(status,body)=>({status:()=>status,json:async()=>body,text:async()=>String(body)});
function fixture({anonymous=false,acceptForgery=false,change=false}={}){
 const calls=[];let previews=0;
 const row={label:'Primary',email:'pilot@example.test',csrf:'private-local-session-aaaaaaaaaaaaaaaaaaaa',
  context:{request:{
   get:async url=>{calls.push({method:'GET',url});return response(anonymous?401:200,'pilot@example.test');},
   post:async(url,options)=>{
    calls.push({method:'POST',url,options});
    if(options.form.csrf===row.csrf){previews++;return response(200,{accounts:1,agent_connections:2,sessions:change?previews:1,previewOnly:true,deleted:false});}
    return response(acceptForgery?200:403,{error:url.endsWith('/api/account')?'invalid_session_or_scope':'invalid_session_or_csrf'});
   }
  }},page:{goto:async()=>response(401,'')}};
 return {row,calls};
}
describe('standalone live-CSRF tooling, controlled adapters only',()=>{
 it('starts through the locked Playwright dependency and refuses an empty browser cache before network or login',async()=>{
  const cache=await mkdtemp(join(tmpdir(),'workspace-csrf-empty-browsers-'));
  try{
   const run=promisify(execFile);
   await expect(run(process.execPath,[fileURLToPath(new URL('../../scripts/v1-live-csrf-browser.mjs',import.meta.url)),
    '--expected-live','a'.repeat(40)],{
    env:{...process.env,PLAYWRIGHT_BROWSERS_PATH:cache},timeout:15000
   })).rejects.toMatchObject({code:2,stderr:expect.stringContaining('INCOMPLETE: standalone_chromium_not_installed')});
  }finally{await rm(cache,{recursive:true,force:true});}
 });
 it('requires an explicit exact source and refuses attachment/storage arguments',()=>{
  expect(configuration(['--expected-live','a'.repeat(40)])).toEqual({expectedSha:'a'.repeat(40)});
  for(const argv of [[],['--expected-live','main'],['--cdp','http://localhost:9222'],['--storage-state','session.json']])expect(()=>configuration(argv)).toThrow();
 });
 it('rejects mutation or malformed preview receipts',()=>{
  expect(()=>previewCounts({previewOnly:true,deleted:true})).toThrow();
  expect(()=>previewCounts({previewOnly:true,deleted:false,accounts:'1'})).toThrow();
 });
 it('does not mistake an anonymous refusal for an authenticated CSRF pass',async()=>{
  const {row,calls}=fixture({anonymous:true});
  await expect(checkNegatives(row,'foreign-private-csrf-bbbbbbbbbbbbbbbbb')).rejects.toThrow('authenticated_portal_required');
  expect(calls.every(call=>call.method==='GET')).toBe(true);
 });
 it('checks all six negatives, never sends a mutating account action, and sanitizes output',async()=>{
  const {row,calls}=fixture();
  const foreign='foreign-private-csrf-bbbbbbbbbbbbbbbbb';
  const receipt=await checkNegatives(row,foreign);
  expect(receipt.checks).toHaveLength(6);
  for(const call of calls.filter(call=>call.method==='POST')){
   expect([ORIGIN+'/api/account',ORIGIN+'/api/auth/logout']).toContain(call.url);
   if(call.url.endsWith('/api/account'))expect(call.options.form.action).toBe('delete_preview');
   expect(call.options.maxRedirects).toBe(0);
  }
  expect(JSON.stringify(receipt)).not.toContain(row.csrf);
  expect(JSON.stringify(receipt)).not.toContain(foreign);
 });
 it('fails if forgery succeeds or harmless preview counts change',async()=>{
  for(const options of [{acceptForgery:true},{change:true}])await expect(checkNegatives(fixture(options).row,'foreign-private-csrf-bbbbbbbbbbbbbbbbb')).rejects.toThrow();
 });
 it('cleans every test session after incomplete setup and preserves failure',async()=>{
  const first=fixture().row,second={...fixture().row,label:'RAR'};
  const result=await exercise([first,second]); // Same token: invalid setup, not a pass.
  expect(result.result).toBe('FAIL');
  expect(result.cleanup).toEqual([{label:'Primary',result:'already_anonymous'},{label:'RAR',result:'already_anonymous'}]);
  expect(result.acceptance).toBe('NOT_AUTOMATICALLY_PROMOTED');
 });
 it('retains sanitized completed groups even when a later cross-site operation fails',async()=>{
  const first=fixture().row,second=fixture().row,progress=[];
  second.csrf='second-private-session-csrf-bbbbbbbbbbbbb';second.label='RAR';
  const result=await exercise([first,second],'http://127.0.0.1:12345',{onProgress:item=>progress.push(item)});
  expect(result.result).toBe('FAIL');expect(progress).toHaveLength(1);
  expect(progress.every(item=>item.phase==='authenticated_negative_requests'&&item.checks.length===6)).toBe(true);
  for(const row of [first,second])expect(JSON.stringify(progress)).not.toContain(row.csrf);
  expect(result.checks).toEqual(progress.map(({phase,...item})=>item));
 });
 it('serves only fixed harmless cross-site forms on loopback, with no reflected input',async()=>{
  const forms=await startCrossSiteForms();
  const get=path=>new Promise((resolve,reject)=>http.get(forms.origin+path,res=>{
   let text='';res.on('data',part=>text+=part);res.on('end',()=>resolve({status:res.statusCode,text}));
  }).on('error',reject));
  try{
   const page=await get('/preview/wrong');
   expect(page.status).toBe(200);
   expect(page.text).toContain('action="'+ORIGIN+'/api/account"');
   expect(page.text).toContain('value="delete_preview"');
   expect(page.text).not.toContain('request_delete');
   expect((await get('/logout/missing')).text).not.toContain('name="csrf"');
   expect((await get('/preview/wrong?target=https://evil.test')).status).toBe(404);
  }finally{await forms.close();}
 });
});
