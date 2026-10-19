// Keep Google OAuth browser cookies on the operator-selected canonical host.
// Never use an untrusted request Host or proxy header to construct the target.
import {publicResource} from './security.js';

const START_PARAMS=Object.freeze({
  purpose:32,client_id:256,redirect_uri:2048,resource:2048,
  code_challenge:128,state:2048
});

export function redirectCanonicalGet(req,res,path,includeOAuthParams=false){
  if(req.method!=='GET')return false;
  const requestedHost=typeof req.headers?.host==='string'?req.headers.host.trim().toLowerCase():'';
  // Internal test adapters can omit Host. Real browser HTTP requests supply it.
  if(!requestedHost)return false;
  const canonical=publicResource();
  if(requestedHost===new URL(canonical).host.toLowerCase())return false;
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
