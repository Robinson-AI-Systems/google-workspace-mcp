// Bind each owner-approved Google account connection to the browser that
// started it. No OAuth code can be accepted without this fresh setup state.
import {randomBytes,timingSafeEqual} from 'node:crypto';
const NAME='google_setup_nonce',TTL=600000;
export function startGoogleSetup(label=''){
 const nonce=randomBytes(24).toString('base64url');
 const state=new URLSearchParams({setup:'1',nonce,issued:String(Date.now()),label:String(label).slice(0,80)}).toString();
 const cookie=NAME+'='+nonce+'; Path=/api/google/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax';
 return {state,cookie};
}
export function verifyGoogleSetup(value,cookieHeader,now=Date.now()){
 if(typeof value!=='string'||value.length>1024||typeof cookieHeader!=='string')return null;
 const p=new URLSearchParams(value);
 if(p.get('setup')!=='1'||p.getAll('setup').length!==1||p.getAll('nonce').length!==1||p.getAll('issued').length!==1||p.getAll('label').length!==1)return null;
 const nonce=p.get('nonce'),issued=Number(p.get('issued')),label=p.get('label');
 if(!/^[a-zA-Z0-9_-]{32}$/.test(nonce)||!Number.isSafeInteger(issued)||issued>now+15000||issued<now-TTL||label.length>80)return null;
 const pairs=cookieHeader.split(';').map(x=>x.trim()).filter(x=>x.startsWith(NAME+'='));
 if(pairs.length!==1)return null;
 const held=pairs[0].slice(NAME.length+1);
 if(!/^[a-zA-Z0-9_-]{32}$/.test(held))return null;
 return timingSafeEqual(Buffer.from(nonce),Buffer.from(held))?{label}:null;
}
export function clearGoogleSetupCookie(){
 return NAME+'=; Path=/api/google/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
}
