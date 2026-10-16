// A new, independently owner-approved 24h read-only pass. No clipboard transport.
import {generateKeyPairSync,randomBytes,createHash,privateDecrypt,constants} from 'node:crypto';
import {open,readFile,stat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateRtcOrigin} from './rtc-live-probe.mjs';
import {issuanceOptions} from '../src/developer/test-pass-issuance-store.js';
const path='/api/developer/test-pass-issue',hash=v=>createHash('sha256').update(v).digest('hex');
async function writePrivate(file,value){
 const dir=await stat(dirname(resolve(file)));if(!dir.isDirectory()||(dir.mode&0o077)!==0)throw Error('private_directory_required');
 const f=await open(file,'wx',0o600);try{await f.writeFile(value);}finally{await f.close();}
}
async function readPrivate(file){const s=await stat(file);if(!s.isFile()||(s.mode&0o077)!==0)throw Error('private_file_required');return readFile(file,'utf8');}
export async function issueEncryptedTestPass({action,env=process.env,fetcher=fetch}){
 const origin=validateRtcOrigin(env.RTC_ORIGIN),revision=env.RTC_EXPECTED_REVISION;
 const options=issuanceOptions(env.RTC_EXPECTED_ACCOUNT,String(env.RTC_APPROVED_AREAS||'').split(','));
 if(!/^[a-f0-9]{40}$/.test(revision||'')||!env.RTC_HANDOFF_FILE)throw Error('invalid_configuration');
 const request=async(route,body,token)=>{
  const r=await fetcher(origin+route,{method:body===undefined?'GET':'POST',redirect:'error',signal:AbortSignal.timeout(15000),headers:{...(token?{authorization:'Bearer '+token}:{}),...(body===undefined?{}:{'content-type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  const t=await r.text();if(t.length>16384)throw Error('oversize_response');return {status:r.status,data:JSON.parse(t)};
 };
 const contract=await request('/api/contract');if(contract.status!==200||contract.data?.deployment?.sourceRevision!==revision)throw Error('source_mismatch');
 if(action==='start'){
  // Refuse a duplicate start BEFORE registering or issuing a remote request.
  try{await stat(env.RTC_HANDOFF_FILE);throw Error('existing_checkpoint');}catch(e){if(e.code!=='ENOENT')throw e;}
  const keys=generateKeyPairSync('rsa',{modulusLength:2048}),poll=randomBytes(32).toString('base64url');
  const registration=await request('/api/oauth/register',{client_name:'Owner-approved encrypted TEST runner',redirect_uris:[origin+'/api/developer/connect']});
  if(registration.status!==201||!registration.data.client_id)throw Error('registration_failed');
  const state={origin,revision,options,poll,clientId:registration.data.client_id,privateKey:keys.privateKey.export({type:'pkcs8',format:'pem'})};
  await writePrivate(env.RTC_HANDOFF_FILE,JSON.stringify(state));
  const r=await request(path,{client_id:state.clientId,poll_hash:hash(poll),public_key:keys.publicKey.export({type:'spki',format:'pem'}),...options});
  if(r.status!==201||!/^[A-Za-z0-9_-]{43}$/.test(r.data.request_id||'')||r.data.authorization_url!==origin+path+'?state='+r.data.request_id)throw Error('start_failed_no_replay');
  await writePrivate(env.RTC_HANDOFF_FILE+'.request',JSON.stringify({requestId:r.data.request_id,expiresAt:r.data.expires_at}));
  return {status:'awaiting_owner_approval',authorizationUrl:r.data.authorization_url,expiresAt:r.data.expires_at};
 }
 if(action!=='poll'||!env.RTC_PASS_OUTPUT_FILE)throw Error('invalid_action');
 const state=JSON.parse(await readPrivate(env.RTC_HANDOFF_FILE)),pending=JSON.parse(await readPrivate(env.RTC_HANDOFF_FILE+'.request'));
 if(state.origin!==origin||state.revision!==revision||JSON.stringify(state.options)!==JSON.stringify(options)||!/^[A-Za-z0-9_-]{43}$/.test(pending.requestId||'')||!Number.isFinite(Date.parse(pending.expiresAt)))throw Error('checkpoint_mismatch');
 const r=await request(path+'?state='+pending.requestId,undefined,state.poll);
 if(r.status===202)return {status:'awaiting_owner_approval'};
 if(r.status!==200||typeof r.data.sealed_pass!=='string')throw Error('issuance_unavailable');
 const token=privateDecrypt({key:state.privateKey,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(r.data.sealed_pass,'base64url')).toString();
 if(!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(token))throw Error('invalid_credential');
 const identity=await request('/api/whoami',undefined,token),w=identity.data.result;
 if(identity.status!==200||w?.connection!=='pass_'+hash(token).slice(0,20)||w.account!==options.account||w.mode!=='test'||w.profile!=='read_only'||w.allow_writes!==false||!Array.isArray(w.areas)||JSON.stringify([...w.areas].sort())!==JSON.stringify(options.areas))throw Error('exact_identity_unverified');
 await writePrivate(env.RTC_PASS_OUTPUT_FILE,token);
 return {status:'connected_encrypted_test_pass',passId:w.connection,profile:w.profile,areas:w.areas,allowWrites:false};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===resolve(process.argv[1])){
 try{console.log(JSON.stringify(await issueEncryptedTestPass({action:process.argv[2]})));}catch{console.error('Encrypted TEST pass issuance unavailable; no secret printed and no automatic replay.');process.exitCode=1;}
}
