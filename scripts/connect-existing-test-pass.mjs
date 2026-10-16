// Existing-pass transport only. No owner passphrase, provider credential, new
// TEST pass, renewal, revocation or provider operation is requested here.
import {generateKeyPairSync,randomBytes,createHash,privateDecrypt,constants} from 'node:crypto';
import {readFile,open,stat} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRtcOrigin} from './rtc-live-probe.mjs';
const hash=v=>createHash('sha256').update(v).digest('hex');
const path='/api/developer/test-pass';
async function writePrivate(file,value){
 const parent=await stat(dirname(resolve(file)));
 if(!parent.isDirectory()||(parent.mode&0o077)!==0)throw Error('private_directory_required');
 const fd=await open(file,'wx',0o600);try{await fd.writeFile(value);}finally{await fd.close();}
}
async function readPrivate(file){const s=await stat(file);if(!s.isFile()||(s.mode&0o077)!==0)throw Error('private_file_required');return readFile(file,'utf8');}
export async function connectExistingPass({action,env=process.env,fetcher=fetch}){
 const origin=validateRtcOrigin(env.RTC_ORIGIN);
 const passId=env.RTC_EXISTING_PASS_ID,revision=env.RTC_EXPECTED_REVISION,account=env.RTC_EXPECTED_ACCOUNT;
 if(!/^pass_[a-f0-9]{20}$/.test(passId||'')||!/^[a-f0-9]{40}$/.test(revision||'')||!account||!env.RTC_HANDOFF_FILE)throw Error('invalid_configuration');
 const request=async(route,body,token)=>{
  const r=await fetcher(origin+route,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const text=await r.text();if(text.length>16384)throw Error('oversize_response');return {status:r.status,data:JSON.parse(text)};
 };
 const contract=await request('/api/contract');
 if(contract.status!==200||contract.data?.deployment?.sourceRevision!==revision)throw Error('source_mismatch');
 if(action==='start'){
  const {publicKey,privateKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const poll=randomBytes(32).toString('base64url');
  // A registered client is metadata, not an owner-authorized access grant.
  const registration=await request('/api/oauth/register',{client_name:'Existing TEST pass runner',redirect_uris:[origin+'/api/developer/connect']});
  if(registration.status!==201||!registration.data.client_id)throw Error('registration_failed');
  const state={origin,passId,revision,account,poll,privateKey:privateKey.export({type:'pkcs8',format:'pem'}),clientId:registration.data.client_id};
  // Save key material before a remote request. An interrupted start never
  // overwrites newer credentials or triggers an automatic creation replay.
  await writePrivate(env.RTC_HANDOFF_FILE,JSON.stringify(state));
  const r=await request(path,{client_id:state.clientId,pass_id:passId,poll_hash:hash(poll),public_key:publicKey.export({type:'spki',format:'pem'})});
  if(r.status!==201||!r.data.request_id)throw Error('handoff_start_failed');
  const expected=origin+path+'?state='+r.data.request_id;
  if(r.data.authorization_url!==expected||!/^[A-Za-z0-9_-]{43}$/.test(r.data.request_id))throw Error('handoff_response_invalid');
  await writePrivate(env.RTC_HANDOFF_FILE+'.request',JSON.stringify({requestId:r.data.request_id,expiresAt:r.data.expires_at}));
  return {status:'awaiting_existing_pass_sign_in',authorizationUrl:expected,expiresAt:r.data.expires_at};
 }
 if(action!=='poll'||!env.RTC_PASS_OUTPUT_FILE)throw Error('invalid_action');
 const state=JSON.parse(await readPrivate(env.RTC_HANDOFF_FILE)),pending=JSON.parse(await readPrivate(env.RTC_HANDOFF_FILE+'.request'));
 if(state.origin!==origin||state.passId!==passId||state.account!==account||state.revision!==revision||!(Date.parse(pending.expiresAt)>Date.now())||!/^[A-Za-z0-9_-]{43}$/.test(pending.requestId))throw Error('checkpoint_mismatch');
 const r=await request(path+'?state='+pending.requestId,undefined,state.poll);
 if(r.status===202)return {status:'awaiting_existing_pass_sign_in'};
 if(r.status!==200||typeof r.data.sealed_pass!=='string')throw Error('handoff_unavailable');
 const token=privateDecrypt({key:state.privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(r.data.sealed_pass,'base64url')).toString();
 if(!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(token)||'pass_'+hash(token).slice(0,20)!==passId)throw Error('pass_mismatch');
 const identity=await request('/api/whoami',undefined,token),w=identity.data.result;
 if(identity.status!==200||w?.connection!==passId||w.account!==account||w.mode!=='test')throw Error('test_identity_unverified');
 await writePrivate(env.RTC_PASS_OUTPUT_FILE,token);
 return {status:'connected_existing_test_pass',profile:w.profile,areas:w.areas,allowWrites:w.allow_writes};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{console.log(JSON.stringify(await connectExistingPass({action:process.argv[2]})));}catch{console.error('Existing TEST pass connection failed; no secrets printed and no automatic replay.');process.exitCode=1;}
}
