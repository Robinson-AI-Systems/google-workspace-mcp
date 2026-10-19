// Atomically issue one explicitly selected read-only pass AND save only its runner ciphertext.
// A failed/overlapping submission cannot leave an untransferred or duplicate pass.
import {randomBytes,createHash,publicEncrypt,constants} from 'node:crypto';
import {handoffStore} from './handoff-store.js';
import {passOptions,testAccountEnrolled} from '../rtc/pass-options.js';
export const issuancePrefix='rtc-issue:';
export function issuanceOptions(account,areas,mode='test'){
 if(!['test','live'].includes(mode))throw Error('invalid_request');
 const p=passOptions({googleAccount:account,areas,mode,profile:'read_only',hours:mode==='live'?1:24,allowWrites:false,forHub:false});
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.account)||!p.areas)throw Error('invalid_request');
 return {account:p.account,areas:[...p.areas].sort(),...(mode==='live'?{mode}: {})};
}
export function testPassIssuanceStore(query){
 return {...handoffStore(query),async issue(row){
  const options=JSON.parse(row.challenge),valid=issuanceOptions(options.account,options.areas,options.mode);
  if(JSON.stringify(valid)!==row.challenge||!row.client_id.startsWith(issuancePrefix)||(valid.mode!=='live'&&!testAccountEnrolled(valid.account)))throw Error('invalid_test_account');
  const token='rtc_pass_'+randomBytes(32).toString('base64url');
  const hash=createHash('sha256').update(token).digest('hex'),id='pass_'+hash.slice(0,20);
  // Encrypt BEFORE the atomic statement. A crypto failure cannot mint a pass.
  const sealed=publicEncrypt({key:row.public_key,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(token)).toString('base64url');
  const result=await query(`WITH pending AS (
    SELECT state FROM developer_oauth_handoffs
    WHERE state=$1 AND client_id=$2 AND challenge=$3 AND public_key=$4
      AND status='pending' AND expires_at>now() AND delivered_at IS NULL
      AND EXISTS(SELECT 1 FROM google_accounts WHERE email=$5)
    FOR UPDATE
   ), issued AS (
    INSERT INTO rtc_passes(id,token_hash,google_account,areas,rate_limit_per_minute,expires_at,for_hub,allow_writes,profile,mode,cost_policy)
    SELECT $6,$7,$5,$8::text[],120,now()+($11::text || ' hours')::interval,false,false,'read_only',$10,'{"mode":"deny"}'::jsonb FROM pending
    RETURNING id
   ) UPDATE developer_oauth_handoffs SET status='authorized',sealed_code=$9
     WHERE state IN(SELECT state FROM pending) AND EXISTS(SELECT 1 FROM issued)
     RETURNING state`,[row.state,row.client_id,row.challenge,row.public_key,valid.account,id,hash,valid.areas,sealed,valid.mode||'test',valid.mode==='live'?1:24]);
  return result.length===1;
 }};
}
