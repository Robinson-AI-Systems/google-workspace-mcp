import {createSession,readSession,revokeSession} from './store.js';
import {cookie,readCookie,readCookies,digest,requireScope,headers} from './security.js';
export const SESSION_COOKIE='p10_session';
export const CSRF_COOKIE='p10_csrf';
export const BROWSER_COOKIE='p10_google_browser';
export async function requireSession(req){
 // D-006 MC-7.3: if the browser sends more than one session cookie, use the
 // one the server recognises instead of treating the person as signed out.
 for(const secret of readCookies(req,SESSION_COOKIE)){
  const row=await readSession(secret);
  if(row)return {...row,secret};
 }
 requireScope(false,'session_required');
}
export function requireCsrf(req,session,body={}){
 // The double-submit check still needs a cookie equal to the supplied value
 // and matching this session; with duplicate cookies (MC-7.3) any one
 // matching copy is enough. A forged value still fails the session hash.
 const cookieValues=readCookies(req,CSRF_COOKIE);
 const supplied=req.headers?.['x-csrf-token']||body.csrf;
 requireScope(typeof supplied==='string'&&supplied.length>=32&&
   cookieValues.includes(supplied)&&digest(supplied)===session.csrf_hash,'invalid_csrf');
}
export async function setSession(res,principalId){
 const {secret,csrf}=await createSession(principalId);
 const existing=res.getHeader?.('Set-Cookie')||[];
 res.setHeader('Set-Cookie',[
   ...(Array.isArray(existing)?existing:[existing]),
   cookie(SESSION_COOKIE,secret,'/',86400),
   cookie(CSRF_COOKIE,csrf,'/',86400)
 ].filter(Boolean));
 return {principalId};
}
export async function clearSession(req,res){
 const secret=readCookie(req,SESSION_COOKIE);
 if(secret)await revokeSession(secret);
 res.setHeader('Set-Cookie',[
   cookie(SESSION_COOKIE,'','/',0),cookie(CSRF_COOKIE,'','/',0)
 ]);
}
export function prepare(res){headers(res);res.setHeader('Vary','Cookie');}
