// Owner-authorized opt-in DIRECT RTC probe. No secret in argv, stdout or code.
// Relay/Sandbox routes must be exercised separately by the Hub's D-4 runner.
import {fileURLToPath} from 'node:url';
export function validateRtcOrigin(value){
 const u=new URL(value);
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!u.hostname||u.port)throw new Error('Use an exact HTTPS origin.');
 return u.origin;
}
export function chooseReadTool(tools,name){
 const selected=(tools||[]).find(t=>t.name===name);
 if(!selected||selected.writes!==false||selected.annotations?.readOnlyHint!==true)throw new Error('Selected tool must be an advertised harmless read.');
 return selected;
}
async function json(url,pass,path,opts={}){
 const response=await fetch(url+path,{...opts,redirect:'error',signal:AbortSignal.timeout(10000),
   headers:{...opts.headers,...(pass?{authorization:'Bearer '+pass}:{})}});
 let value;try{value=await response.json()}catch{throw new Error('invalid_json');}
 return {status:response.status,value};
}
export async function main(args=process.argv.slice(2),env=process.env){
 const verifyRevoked=args.includes('--verify-revoked');
 if(args.length!==1||(!args.includes('--authorized-read-only')&&!verifyRevoked)){
  console.error('Usage: rtc-live-probe --authorized-read-only OR --verify-revoked (secret and origin in protected env)');return 2;
 }
 const token=env.RTC_TEST_PASS;
 if(!token||!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(token)||!env.RTC_ORIGIN){console.error('Missing protected RTC_ORIGIN or RTC_TEST_PASS');return 2;}
 let origin;try{origin=validateRtcOrigin(env.RTC_ORIGIN);}catch{console.error('Invalid RTC HTTPS origin');return 2;}
 let step='manifest';
 try{
  const contract=await json(origin,null,'/api/contract');
  if(contract.status!==200||contract.value.rtc!==1)throw Error('manifest');
  step='whoami';
  const who=await json(origin,token,'/api/whoami');
  if(verifyRevoked){
   if(who.status!==401||who.value.error?.code!=='pass_revoked')throw Error('not_revoked');
   console.log('PASS revoked-pass refusal; UTC '+new Date().toISOString());return 0;
  }
  if(who.status!==200||who.value.result?.profile!=='read_only'||who.value.result?.mode!=='test'||who.value.result?.allow_writes!==false)throw Error('scope');
  step='catalog';
  const catalog=await json(origin,token,'/api/tools?listing=catalog&limit=100');
  if(catalog.status!==200||!Array.isArray(catalog.value.result?.tools))throw Error('catalog');
  const name=env.RTC_READ_TOOL||'workspace_where_is_setting';
  const chosen=chooseReadTool(catalog.value.result.tools,name);
  step='read';
  let data;
  try{data=env.RTC_READ_ARGS_JSON?JSON.parse(env.RTC_READ_ARGS_JSON):name==='workspace_where_is_setting'?{query:'DKIM'}:{};}
  catch{throw Error('invalid_args');}
  const actual=await json(origin,token,'/api/tools/'+encodeURIComponent(chosen.name),
   {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(data)});
  if(actual.status!==200||actual.value.ok!==true)throw Error('read');
  console.log('PASS RTC 1 direct TEST read-only route; tool='+chosen.name+'; UTC '+new Date().toISOString());
  console.log('Pass revocation, private encrypted relay and Vercel Sandbox direct route remain separately UNVERIFIED.');
  return 0;
 }catch{
  console.error('FAIL RTC direct probe step='+step+'; no secret or response content printed');return 1;
 }
}
if(process.argv[1]&&import.meta.url===new URL('file://'+fileURLToPath(import.meta.url)).href&&fileURLToPath(import.meta.url)===process.argv[1])process.exitCode=await main();
