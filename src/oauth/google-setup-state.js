// An OAuth client ID and browser Cookie are both public/client-controlled.
// Require an unforgeable service-issued HMAC before exchanging ANY Google code.
// The encryption key is a server-only secret already required for hosted token
// safety; a domain-separated HMAC never exposes or alters stored Google tokens.
import {randomBytes,timingSafeEqual,createHmac,createHash} from 'node:crypto';
const NAME='google_setup_nonce',TTL=600000;
function signingKey(){
 const k=process.env.TOKEN_ENCRYPTION_KEY;
 return typeof k==='string'&&k.length>=16?k:null;
}
function mac(nonce,issued,label,browserDigest,key){
 return createHmac('sha256',key).update('robinson-google-mcp/owner-google-setup/v1\n')
   .update(JSON.stringify([nonce,issued,label,browserDigest])).digest('base64url');
}
export function startGoogleSetup(label=''){
 const key=signingKey();
 if(!key)throw Error('Owner Google setup signing key is not configured.');
 const nonce=randomBytes(24).toString('base64url'),issued=String(Date.now());
 // The cookie secret is NOT in the provider-visible OAuth state. A stolen
 // signed state alone cannot be replayed with a forged browser cookie.
 const browserSecret=randomBytes(32).toString('base64url');
 const browserDigest=createHash('sha256').update(browserSecret).digest('base64url');
 const safeLabel=String(label).slice(0,80);
 const state=new URLSearchParams({setup:'1',nonce,issued,label:safeLabel,browser:browserDigest,mac:mac(nonce,issued,safeLabel,browserDigest,key)}).toString();
 const cookie=NAME+'='+browserSecret+'; Path=/api/google/callback; Max-Age=600; HttpOnly; Secure; SameSite=Lax';
 return {state,cookie};
}
export function verifyGoogleSetup(value,cookieHeader,now=Date.now()){
 const key=signingKey();
 if(!key||typeof value!=='string'||value.length>1024||typeof cookieHeader!=='string')return null;
 const p=new URLSearchParams(value);
 if(p.get('setup')!=='1'||['setup','nonce','issued','label','browser','mac'].some(x=>p.getAll(x).length!==1))return null;
 const nonce=p.get('nonce'),issued=p.get('issued'),label=p.get('label'),browserDigest=p.get('browser'),signature=p.get('mac');
 const when=Number(issued);
 if(!/^[a-zA-Z0-9_-]{32}$/.test(nonce)||!/^[0-9]{13}$/.test(issued)||
    !Number.isSafeInteger(when)||when>now+15000||when<now-TTL||label.length>80||
    !/^[A-Za-z0-9_-]{43}$/.test(signature)||!/^[A-Za-z0-9_-]{43}$/.test(browserDigest))return null;
 const expected=mac(nonce,issued,label,browserDigest,key);
 if(!timingSafeEqual(Buffer.from(expected),Buffer.from(signature)))return null;
 const pairs=cookieHeader.split(';').map(x=>x.trim()).filter(x=>x.startsWith(NAME+'='));
 if(pairs.length!==1)return null;
 const held=pairs[0].slice(NAME.length+1);
 if(!/^[a-zA-Z0-9_-]{43}$/.test(held))return null;
 const derived=createHash('sha256').update(held).digest('base64url');
 return timingSafeEqual(Buffer.from(browserDigest),Buffer.from(derived))?{label}:null;
}
export function clearGoogleSetupCookie(){
 return NAME+'=; Path=/api/google/callback; Max-Age=0; HttpOnly; Secure; SameSite=Lax';
}
