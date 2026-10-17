// Distinct public Google app: NEVER borrow the owner GOOGLE_OAUTH_CLIENT_*.
import crypto from 'node:crypto';
import {google} from 'googleapis';
import {publicResource,requireScope,validEmail,digest} from './security.js';
import {SCOPE_GROUPS} from '../auth/scopes.js';
export const IDENTITY_SCOPES=Object.freeze(['openid','email','profile']);
export const PUBLIC_SCOPE_GROUPS=Object.freeze({
 mail:SCOPE_GROUPS.gmail,files:SCOPE_GROUPS.drive,calendar:SCOPE_GROUPS.calendar,
 tasks:SCOPE_GROUPS.tasks,contacts:SCOPE_GROUPS.contacts,
 adminVerify:['https://www.googleapis.com/auth/admin.directory.user.readonly']
});
export function publicGoogleClient(env=process.env){
 const id=env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID,secret=env.GOOGLE_PUBLIC_OAUTH_CLIENT_SECRET;
 requireScope(typeof id==='string'&&id.length>5&&typeof secret==='string'&&secret.length>5,'public_google_not_configured');
 // The callback must be registered on a separately owned Google OAuth app.
 return new google.auth.OAuth2(id,secret,publicResource()+'/api/auth/google/callback');
}
export function providerUrl({client,state,nonce,verifier,group='identity'}){
 requireScope(client&&typeof state==='string'&&typeof nonce==='string'&&typeof verifier==='string','invalid_provider_start');
 const selected=group==='identity'?[]:PUBLIC_SCOPE_GROUPS[group];
 requireScope(Array.isArray(selected),'invalid_scope_group');
 const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
 return client.generateAuthUrl({
   response_type:'code',scope:[...IDENTITY_SCOPES,...selected],
   access_type:group==='identity'?'online':'offline',
   ...(group==='identity'?{}:{include_granted_scopes:true,prompt:'consent'}),
   code_challenge:challenge,code_challenge_method:'S256',state,nonce
 });
}
export async function verifyGoogleCode({client,code,verifier,nonceHash}){
 requireScope(typeof code==='string'&&code.length>0&&verifier&&nonceHash,'invalid_google_callback');
 // Current Google SDK getToken({code,codeVerifier}) and verifyIdToken({idToken,audience})
 // perform provider-side PKCE and verified signature+audience/expiry validation.
 const {tokens}=await client.getToken({code,codeVerifier:verifier,
   redirect_uri:publicResource()+'/api/auth/google/callback'});
 requireScope(tokens?.id_token,'identity_token_missing');
 const ticket=await client.verifyIdToken({idToken:tokens.id_token,
   audience:process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID});
 const claims=ticket.getPayload();
 requireScope(claims&&['accounts.google.com','https://accounts.google.com'].includes(claims.iss)
   &&claims.aud===process.env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID
   &&Number.isFinite(claims.exp)&&claims.exp>Math.floor(Date.now()/1000)
   &&typeof claims.nonce==='string'&&digest(claims.nonce)===nonceHash&&claims.email_verified===true
   &&typeof claims.sub==='string'&&claims.sub.length>=4&&
   validEmail(claims.email),'invalid_verified_identity');
 return {issuer:claims.iss,sub:claims.sub,email:claims.email.toLowerCase(),
   tokens,scopeList:String(tokens.scope||'').split(/\s+/).filter(Boolean)};
}
