// Two separately spawned processes run the actual Workspace HTTP/OAuth modules.
// Import substitution is confined to this CI fixture, never production exports.
import {registerHooks} from 'node:module';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import crypto from 'node:crypto';
const url=new URL(process.env.TEST_DATABASE_URL||'http://invalid');
if(process.env.RTC_LOCAL_CONFORMANCE!=='1'||!['127.0.0.1','localhost','[::1]'].includes(url.hostname))
 throw Error('Only explicitly isolated local PostgreSQL conformance is allowed.');
registerHooks({resolve(specifier,context,next){
 if(specifier==='@neondatabase/serverless')return {url:new URL('./postgres-adapter.mjs',import.meta.url).href,shortCircuit:true};
 if(specifier.endsWith('/auth/google-auth-hosted.js'))return {url:new URL('./google-provider.mjs',import.meta.url).href,shortCircuit:true};
 return next(specifier,context);
}});
const db=await import('../../src/db.js');
await db.initSchema();
const {default:gateway}=await import('../../api/rtc-gateway.js');
const {default:oauth}=await import('../../api/oauth/token.js');
const {control}=await import('./google-provider.mjs');
const {pool}=await import('./postgres-adapter.mjs');
const rewrites=JSON.parse(await readFile(new URL('../../vercel.json',import.meta.url))).rewrites;
const account='rtc-fixture@example.test';
const app=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('content-type','application/json');res.end(JSON.stringify(value));return res;};
 if(url.pathname==='/api/oauth/token'){await oauth(req,res);return;}
 const chunks=[];for await(const c of req)chunks.push(c);
 const raw=Buffer.concat(chunks).toString();
 try{
  req.body=raw?JSON.parse(raw):{};req.query=Object.fromEntries(url.searchParams);
  for(const rule of rewrites){
   if(!rule.destination.startsWith('/api/rtc-gateway'))continue;
   const keys=[];const pattern=rule.source.replace(/:([a-z]+)/g,(_,key)=>{keys.push(key);return '([^/]+)';});
   const match=new RegExp('^'+pattern+'$').exec(url.pathname);if(!match)continue;
   const query=new URL(rule.destination,'http://internal').searchParams;
   for(const [key,value] of query)req.query[key]=value.startsWith(':')?decodeURIComponent(match[1+keys.indexOf(value.slice(1))]):value;
   await gateway(req,res);return;
  }
  res.status(404).json({error:'not_found'});
 }catch{res.status(500).json({error:'local_fixture_failure'});}
});
await new Promise(resolve=>app.listen(0,'127.0.0.1',resolve));
process.send({ready:true,url:'http://127.0.0.1:'+app.address().port});
process.on('message',async message=>{
 try{
  let result;
  if(message.command==='seed'){
   await db.saveGoogleTokensFor(account,{access_token:'synthetic-provider-access'});
   const full=await db.createRtcPass({googleAccount:account,allowWrites:true,confirmedAccount:account,areas:['mail','files','calendar','workspace'],rateLimit:600});
   const readOnly=await db.createRtcPass({googleAccount:account,rateLimit:600});
   const expired=await db.createRtcPass({googleAccount:account}),revoked=await db.createRtcPass({googleAccount:account}),limited=await db.createRtcPass({googleAccount:account});
   await pool.query("UPDATE rtc_passes SET expires_at=now()-interval '1 second' WHERE id=$1",[expired.id]);
   await db.revokeRtcPass(revoked.id);
   const refresh=crypto.randomBytes(32).toString('base64url'),access=crypto.randomBytes(32).toString('base64url');
   await db.createOAuthClient({clientId:'local-conformance',redirectUris:['https://example.test/callback'],clientName:'Local conformance'});
   await db.createAccessToken({accessToken:access,refreshToken:refresh,clientId:'local-conformance',googleAccount:account,profile:'read_only',listing:'compact',areas:['mail']});
   result={passes:{full:full.token,readOnly:readOnly.token,expired:expired.token,revoked:revoked.token},limited:limited.token,refresh,access};
  }else if(message.command==='inspect'){
   const row=await db.getAccessToken(message.token);
   result=row?{profile:row.profile,listing:row.listing,areas:row.areas,mode:row.mode??null,account:row.google_account}:null;
  }else if(message.command==='fault'){control.fault(message.name);result=true;}
  else if(message.command==='counts')result=control.counts();
  else if(message.command==='close'){
   await new Promise(resolve=>app.close(resolve));await pool.end();process.send({id:message.id,result:true});process.disconnect();return;
  }else throw Error('unknown fixture control');
  process.send({id:message.id,result});
 }catch{process.send({id:message.id,error:'fixture_control_failed'});}
});
