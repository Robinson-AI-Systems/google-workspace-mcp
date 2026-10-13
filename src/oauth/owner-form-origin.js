// Owner forms are CSRF-protected against the actual browser-visible service
// origin, not solely a possibly stale OAuth/connector PUBLIC_BASE_URL.
// Vercel routes only domains assigned to the project; its Host is not
// x-forwarded-host or another client-supplied forwarding hint.
function httpsOrigin(value) {
 try {
  const url=new URL(value);
  return url.protocol==='https:'&&!url.username&&!url.password&&!url.search&&!url.hash&&
   (url.pathname==='/'||url.pathname==='')&&!url.port?url.origin:null;
 } catch {return null;}
}
export function ownerFormOrigins(req,configured=process.env.PUBLIC_BASE_URL) {
 const origins=new Set(), configuredOrigin=httpsOrigin(configured);
 if(configuredOrigin)origins.add(configuredOrigin);
 const host=req?.headers?.host;
 // Additional verified Vercel aliases/deployment domains need not equal the
 // canonical OAuth issuer. The Vercel edge checks their project ownership.
 if(typeof host==='string'&&/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(host))
  origins.add('https://'+host.toLowerCase());
 return origins;
}
export function ownerFormAllowed(req,configured) {
 if(req?.headers?.['sec-fetch-site']==='cross-site')return false;
 const accepted=ownerFormOrigins(req,configured);
 const origin=req?.headers?.origin;
 if(typeof origin==='string')return accepted.has(origin);
 // Some privacy-sensitive browsers omit Origin on navigation form submits;
 // a full same-origin Referrer is a safe fallback. Missing both fails shut.
 const referer=req?.headers?.referer;
 if(typeof referer!=='string')return false;
 try {
  const u=new URL(referer);
  return accepted.has(u.origin);
 } catch {return false;}
}
export function ownerFormOriginWarning(req,configured) {
 const active=req?.headers?.host;
 if(typeof active!=='string'||!/^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.vercel\.app$/i.test(active))return false;
 const expected=httpsOrigin(configured);
 return expected!==('https://'+active.toLowerCase());
}
