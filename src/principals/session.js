import {createSession,readSession,revokeSession} from './store.js';
import {cookie,readCookie,digest,requireScope,headers} from './security.js';
export const SESSION_COOKIE='p10_session';
export const CSRF_COOKIE='p10_csrf';
export const BROWSER_COOKIE='p10_google_browser';
export async function requireSession(req){
 const secret=readCookie(req,SESSION_COOKIE);
 const row=await readSession(secret);
 requireScope(row,'session_required');
 return {...row,secret};
}
export function requireCsrf(req,session,body={}){
 const cookieValue=readCookie(req,CSRF_COOKIE);
 const supplied=req.headers?.['x-csrf-token']||body.csrf;
 requireScope(typeof supplied==='string'&&supplied.length>=32&&
   cookieValue===supplied&&digest(supplied)===session.csrf_hash,'invalid_csrf');
}
export async function setSession(res,principalId){
 const {secret,csrf}=await createSession(principalId);
 res.setHeader('Set-Cookie',[
   cookie(SESSION_COOKIE,secret,'/',86400),
   cookie(CSRF_COOKIE,csrf,'/',86400)
 ]);
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
