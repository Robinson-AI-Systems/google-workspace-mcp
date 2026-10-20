// Read-only transport/account diagnosis. Never starts a BrowserStack session.
import {fileURLToPath} from 'node:url';

export const PLAN_URL='https://api.browserstack.com/automate/plan.json';
export async function probe({fetcher=fetch,username,key}={}){
 const authenticatedRequest=Boolean(username&&key);
 if(Boolean(username)!==Boolean(key))return {result:'INCOMPLETE',reason:'credential_pair_incomplete',sessionStarted:false};
 const headers={accept:'application/json'};
 if(authenticatedRequest)headers.authorization='Basic '+Buffer.from(username+':'+key).toString('base64');
 let response;
 try{response=await fetcher(PLAN_URL,{method:'GET',headers,redirect:'manual',signal:AbortSignal.timeout(15000)});}
 catch{return {result:'INCOMPLETE',reason:'network_request_failed',authenticatedRequest,sessionStarted:false};}
 let body;
 try{body=await response.text();}catch{return {result:'INCOMPLETE',reason:'response_read_failed',authenticatedRequest,sessionStarted:false};}
 const status=response.status;
 const siteUnavailable=/<title>\s*Site Unavailable\s*<\/title>/i.test(body);
 const base={status,authenticatedRequest,sessionStarted:false};
 if(siteUnavailable)return {...base,result:'INCOMPLETE',reason:'site_unavailable_interstitial'};
 if(!authenticatedRequest){
  // An actual provider authentication challenge proves only network reachability.
  const reachable=status===401&&Boolean(response.headers.get('www-authenticate'));
  return {...base,result:reachable?'PASS_NETWORK_ONLY':'INCOMPLETE',reason:reachable?'provider_authentication_challenge':'unexpected_anonymous_response'};
 }
 if(status!==200)return {...base,result:'INCOMPLETE',reason:status===401?'credentials_not_accepted':'provider_http_refusal'};
 let data;
 try{data=JSON.parse(body);}catch{return {...base,result:'INCOMPLETE',reason:'provider_response_not_json'};}
 const fields=['parallel_sessions_max_allowed','parallel_sessions_running','queued_sessions'];
 if(!data||typeof data!=='object'||Array.isArray(data)||!Number.isSafeInteger(data.parallel_sessions_max_allowed)||data.parallel_sessions_max_allowed<0){
  return {...base,result:'INCOMPLETE',reason:'unrecognized_plan_response'};
 }
 const capacity={};
 for(const field of fields)if(Number.isSafeInteger(data[field])&&data[field]>=0)capacity[field]=data[field];
 return {...base,result:'PASS_ACCOUNT_READ_ONLY',capacity,
  includedFreeEntitlement:'NOT_VERIFIED',interactiveLogin:'NOT_VERIFIED',csrfAcceptance:'NOT_PERFORMED'};
}
async function main(argv){
 if(argv.length!==1||!['--network','--account'].includes(argv[0]))throw new Error('usage_network_or_account');
 const account=argv[0]==='--account';
 if(account&&(!process.env.BROWSERSTACK_USERNAME||!process.env.BROWSERSTACK_ACCESS_KEY)){
  console.log(JSON.stringify({result:'INCOMPLETE',reason:'github_actions_secrets_missing',sessionStarted:false}));process.exitCode=2;return;
 }
 const result=await probe(account?{username:process.env.BROWSERSTACK_USERNAME,key:process.env.BROWSERSTACK_ACCESS_KEY}:{});
 console.log(JSON.stringify(result,null,2));
 if(!result.result.startsWith('PASS_'))process.exitCode=2;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1])main(process.argv.slice(2)).catch(()=>{
 console.error('INCOMPLETE: preflight_configuration_error');process.exitCode=2;
});
