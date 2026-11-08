// Keep Google OAuth browser cookies on the operator-selected canonical host.
// Never use an untrusted request Host or proxy header to construct the target.
import {isIP} from 'node:net';
import {publicResource} from './security.js';

const START_PARAMS=Object.freeze({
  purpose:32,client_id:256,redirect_uri:2048,resource:2048,
  code_challenge:128,state:2048
});

function firstHeaderValue(value){
  const single=Array.isArray(value)?value[0]:value;
  return typeof single==='string'?single.trim().toLowerCase():'';
}

function hostNamePart(host){
  if(host.startsWith('[')){
    const end=host.indexOf(']');
    return end>0?host.slice(1,end):host;
  }
  const idx=host.lastIndexOf(':');
  return idx>0&&/^\d+$/.test(host.slice(idx+1))?host.slice(0,idx):host;
}

// Internal endpoint addresses are how the rack gateway addresses an
// instance container: an IP literal, localhost, or a single-label
// container name. No browser ever visits this service at such an
// address; one can only appear as the Host a proxy hop substituted.
function isInternalEndpointHost(host){
  const name=hostNamePart(host);
  return name==='localhost'||isIP(name)!==0||!name.includes('.');
}

// Whether this request was already addressed to the canonical public
// host, in the form the serving layer presents it:
// - Direct/platform serving (Vercel): the edge presents the addressed
//   public host as the Host header.
// - Rack serving: the gateway proxies to the instance's internal
//   endpoint, so Host is that internal address, and the public host the
//   request was addressed to is the one the gateway preserved in
//   x-forwarded-host. The gateway overwrites that header from the Host
//   it was addressed by, and the instance is reachable only through it.
// A forwarded value can satisfy this check ONLY alongside an internal
// endpoint Host, so on a public platform — where Host is always a
// public name — a spoofed forwarding header changes nothing. Redirect
// targets are never built from either header; they come only from the
// configured canonical origin.
export function requestHostIsCanonical(req,canonicalOrigin){
  let canonicalHost;
  try{canonicalHost=new URL(canonicalOrigin).host.toLowerCase();}catch{return false;}
  const host=firstHeaderValue(req.headers?.host);
  if(!host)return false;
  if(host===canonicalHost)return true;
  if(!isInternalEndpointHost(host))return false;
  return firstHeaderValue(req.headers?.['x-forwarded-host'])===canonicalHost;
}

export function redirectCanonicalGet(req,res,path,includeOAuthParams=false){
  if(req.method!=='GET')return false;
  const requestedHost=typeof req.headers?.host==='string'?req.headers.host.trim().toLowerCase():'';
  // Internal test adapters can omit Host. Real browser HTTP requests supply it.
  if(!requestedHost)return false;
  const canonical=publicResource();
  if(requestHostIsCanonical(req,canonical))return false;
  const target=new URL(path,canonical);
  if(includeOAuthParams){
    for(const [key,max] of Object.entries(START_PARAMS)){
      const value=req.query?.[key];
      if(typeof value==='string'&&value.length<=max&&!/[\u0000-\u001f\u007f]/.test(value))
        target.searchParams.set(key,value);
    }
  }
  res.setHeader('Cache-Control','no-store');
  res.writeHead(303,{Location:target.toString()});
  res.end();
  return true;
}
