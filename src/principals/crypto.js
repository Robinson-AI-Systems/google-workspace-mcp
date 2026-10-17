import crypto from 'node:crypto';
import {loadKey} from '../crypto.js';
const context=(p,a,purpose)=>Buffer.from(JSON.stringify(['robinson/p10/v2',p,a,purpose]));
const key=()=>{const k=loadKey();if(!k)throw Error('v2_encryption_key_missing');return k;};
export function sealV2(value,principal,account,purpose){
 if(!principal||!account||!purpose)throw Error('invalid_v2_owner');
 const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',key(),iv);
 c.setAAD(context(principal,account,purpose));
 const bytes=Buffer.concat([c.update(JSON.stringify(value),'utf8'),c.final()]);
 return ['v2',iv.toString('base64url'),c.getAuthTag().toString('base64url'),bytes.toString('base64url')].join('.');
}
export function openV2(stored,principal,account,purpose){
 const parts=typeof stored==='string'?stored.split('.'):[];
 if(parts.length!==4||parts[0]!=='v2')throw Error('invalid_v2_envelope');
 const iv=Buffer.from(parts[1],'base64url'),tag=Buffer.from(parts[2],'base64url');
 if(iv.length!==12||tag.length!==16)throw Error('invalid_v2_envelope');
 const d=crypto.createDecipheriv('aes-256-gcm',key(),iv);
 d.setAAD(context(principal,account,purpose));d.setAuthTag(tag);
 return JSON.parse(Buffer.concat([d.update(Buffer.from(parts[3],'base64url')),d.final()]).toString('utf8'));
}
