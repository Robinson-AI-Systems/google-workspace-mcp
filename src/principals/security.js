import crypto from 'node:crypto';
export const OWNER_ID='00000000-0000-4000-8000-000000000001';
export const digest=value=>crypto.createHash('sha256').update(String(value)).digest('hex');
export const mint=prefix=>prefix+crypto.randomBytes(32).toString('base64url');
export const validUuid=x=>typeof x==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(x);
export const validEmail=x=>typeof x==='string'&&x.length<255&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x);
export const requireScope=(ok,code='outside_scope')=>{if(!ok)throw Error(code);};
export function publicMode(env=process.env){
 const m=env.PUBLIC_SIGNIN_MODE??'off';
 requireScope(['off','pilot','public'].includes(m),'invalid_public_mode');
 return m;
}
export function admitted(sub,env=process.env){
 const m=publicMode(env);
 return m==='public'||m==='pilot'&&String(env.PUBLIC_PILOT_GOOGLE_SUBJECTS||'').split(',').map(x=>x.trim()).includes(sub);
}
// A single separately owner-approved previously connected TEST mailbox may
// coexist as a *browser identity only*. The public pilot roster alone never
// authorizes crossing the legacy-owner email reservation.
export function legacyPilotLoginAllowed(sub,env=process.env){
 if(publicMode(env)!=='pilot'||env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED==='true')return false;
 if(typeof sub!=='string'||!/^\\d{10,32}$/.test(sub)||!admitted(sub,env))return false;
 const exceptions=String(env.PUBLIC_PILOT_LEGACY_SUBJECTS||'').split(',')
   .map(x=>x.trim()).filter(Boolean);
 return exceptions.length===1&&exceptions[0]===sub;
}
export const cookie=(name,value,path='/',ttl=3600)=>name+'='+encodeURIComponent(value)+'; Path='+path+'; Max-Age='+ttl+'; HttpOnly; Secure; SameSite=Lax';
export const readCookie=(req,name)=>{
 const a=String(req?.headers?.cookie||'').split(';').map(x=>x.trim()).filter(x=>x.startsWith(name+'='));
 if(a.length!==1)return null;
 try{return decodeURIComponent(a[0].slice(name.length+1));}catch{return null;}
};
export function headers(res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('X-Content-Type-Options','nosniff');
}
export function publicResource(){
 const value=process.env.PUBLIC_BASE_URL;
 if(typeof value!=='string')throw Error('public_origin_required');
 const u=new URL(value);
 requireScope(u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&!u.port&&(u.pathname==='/'||u.pathname===''),'invalid_public_origin');
 return u.origin;
}
