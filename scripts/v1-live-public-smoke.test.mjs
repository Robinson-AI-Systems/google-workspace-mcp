import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inspectV1Public } from './v1-live-public-smoke.mjs';
const sha='d'.repeat(40),canonical='https://google-workspace-mcp-chris-projects-de6cd1bf.vercel.app';
const auth={issuer:canonical,authorization_endpoint:canonical+'/api/oauth/authorize',
  token_endpoint:canonical+'/api/oauth/token',registration_endpoint:canonical+'/api/oauth/register',
  revocation_endpoint:canonical+'/api/oauth/revoke',
  response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],
  code_challenge_methods_supported:['S256'],revocation_endpoint_auth_methods_supported:['none','client_secret_post']};
const secureHeaders={'cache-control':'no-store','content-security-policy':"default-src 'none'",
  'referrer-policy':'no-referrer','content-type':'text/html','x-frame-options':'DENY'};
function fixture({wrongSha=false,plain=false,leak=false,redirect=false,unready=false,badIssuer=false}={}){
 const paths=[],requester=async (value,{method})=>{
   const u=new URL(value);paths.push([u.origin,u.pathname,method]);
   if(redirect && u.pathname==='/')return new Response('',{status:302,headers:{location:'https://attacker.example/'}});
   if(unready && u.pathname==='/api/contract')return new Response('',{status:503});
   if(u.pathname==='/api/contract')return new Response(JSON.stringify({rtc:1,deployment:{sourceRevision:wrongSha?'a'.repeat(40):sha}}),{status:200,headers:{'cache-control':'no-store'}});
   if(u.pathname==='/.well-known/oauth-protected-resource')return new Response(JSON.stringify({resource:canonical+'/api/mcp',authorization_servers:[canonical]}),{status:200,headers:{'cache-control':'no-store'}});
   if(u.pathname==='/.well-known/oauth-authorization-server')return new Response(JSON.stringify({...auth,issuer:badIssuer?'https://attacker.example':canonical,code_challenge_methods_supported:plain?['plain']:['S256']}),{status:200,headers:{'cache-control':'no-store'}});
   if(u.pathname==='/api/account')return new Response(leak?'Connected Google accounts':'Sign in to your Workspace account',{status:401,headers:secureHeaders});
   if(u.pathname==='/api/oauth/revoke')return new Response(JSON.stringify({error:'method_not_allowed'}),{status:405,headers:{'cache-control':'no-store',allow:'POST'}});
   const body={
     '/':'Workspace MCP /api/account /api/privacy /api/support /api/data-deletion',
     '/api/privacy':'Google privacy and retention',
     '/api/support':'Robinson AI Systems support',
     '/api/data-deletion':'disconnect and deletion'}[u.pathname];
   if(body===undefined)throw new Error('Unexpected test path '+u.pathname);
   return new Response(method==='HEAD'?null:body,{status:200,headers:secureHeaders});
 };
 return {requester,paths};
}
test('validates deployed source and both aliases with S256, RFC7009, disclosure HEAD and anonymous protection',async()=>{
 const f=fixture();const value=await inspectV1Public({expectedSha:sha,requester:f.requester});
 assert.equal(value.ok,true);
 assert.equal(value.proofs.length,8);
 assert.equal(f.paths.filter(x=>x[1]==='/api/contract').length,2);
 assert.equal(f.paths.filter(x=>x[2]==='HEAD').length,4);
 assert.deepEqual(f.paths.filter(x=>x[1]==='/api/account').map(x=>x[2]),['GET']);
 assert.deepEqual(f.paths.filter(x=>x[1]==='/api/oauth/revoke').map(x=>x[2]),['GET']);
 assert.ok(f.paths.every(x=>x[2]!=='POST'));
});
test('cannot be spoofed into checking a foreign origin or fake/empty SHA',async()=>{
 for(const origin of ['http://workspace.robinsonaisystems.com/',
   'https://evil.example/', 'https://evil.example@workspace.robinsonaisystems.com/',
   'https://workspace.robinsonaisystems.com:8443/',
   'https://workspace.robinsonaisystems.com/evil']){
  await assert.rejects(inspectV1Public({expectedSha:sha,vanity:origin,requester:fixture().requester}));
 }
 await assert.rejects(inspectV1Public({expectedSha:'main',requester:fixture().requester}),/expected_live_sha_required/);
});
test('rejects source drift, missing deployed service, redirect and public identity leakage',async()=>{
 for(const variant of [{wrongSha:true},{unready:true},{redirect:true},{leak:true}])
  await assert.rejects(inspectV1Public({expectedSha:sha,requester:fixture(variant).requester}));
});
test('rejects OAuth plain PKCE or hostile issuer mismatch',async()=>{
 for(const variant of [{plain:true},{badIssuer:true}])
  await assert.rejects(inspectV1Public({expectedSha:sha,requester:fixture(variant).requester}));
});
