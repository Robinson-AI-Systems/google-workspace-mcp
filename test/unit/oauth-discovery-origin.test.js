import {describe,it,expect,afterEach} from 'vitest';
import authorizationMetadata from '../../api/well-known/oauth-authorization-server.js';
import protectedResourceMetadata from '../../api/well-known/oauth-protected-resource.js';

const originalOrigin=process.env.PUBLIC_BASE_URL;
afterEach(()=>{
 if(originalOrigin===undefined)delete process.env.PUBLIC_BASE_URL;
 else process.env.PUBLIC_BASE_URL=originalOrigin;
});
function response(){
 const out={statusCode:200,headers:{},body:null};
 out.setHeader=(name,value)=>{out.headers[name]=value;};
 out.status=value=>{out.statusCode=value;return out;};
 out.json=data=>{out.body=data;return out;};
 return out;
}
function request(handler){
 const out=response();
 // Host and proxy headers are never a trusted discovery source.
 handler({method:'GET',headers:{host:'attacker.example.test',
  'x-forwarded-host':'attacker-proxy.example.test',
  'x-forwarded-proto':'http'}},out);
 return out;
}
describe('standalone MCP OAuth discovery has a canonical HTTPS issuer',()=>{
 it('keeps correct production-compatible authorization and resource metadata despite hostile HTTP headers',()=>{
  process.env.PUBLIC_BASE_URL='https://workspace.example.test/';
  const auth=request(authorizationMetadata);
  expect(auth.statusCode).toBe(200);
  expect(auth.headers['Cache-Control']).toBe('no-store');
  expect(auth.body).toMatchObject({
   issuer:'https://workspace.example.test',
   authorization_endpoint:'https://workspace.example.test/api/oauth/authorize',
   token_endpoint:'https://workspace.example.test/api/oauth/token',
   registration_endpoint:'https://workspace.example.test/api/oauth/register',
   response_types_supported:['code'],
   grant_types_supported:['authorization_code','refresh_token'],
   code_challenge_methods_supported:['S256','plain'],
   token_endpoint_auth_methods_supported:['client_secret_post','none']
  });
  expect(JSON.stringify(auth.body)).not.toMatch(/attacker|localhost/);
  const resource=request(protectedResourceMetadata);
  expect(resource.statusCode).toBe(200);
  expect(resource.headers['Cache-Control']).toBe('no-store');
  expect(resource.body).toEqual({
   resource:'https://workspace.example.test/api/mcp',
   authorization_servers:['https://workspace.example.test']
  });
 });
 it('returns no issuer or resource on missing or invalid operator configuration',()=>{
  const bad=[null,'','http://workspace.example.test',
   'https://user:pass@workspace.example.test','https://workspace.example.test:444',
   'https://workspace.example.test/child','https://workspace.example.test/?q=1',
   'https://workspace.example.test/#fragment','javascript:alert(1)','not a URL'];
  for(const value of bad){
   if(value===null)delete process.env.PUBLIC_BASE_URL;
   else process.env.PUBLIC_BASE_URL=value;
   for(const endpoint of [authorizationMetadata,protectedResourceMetadata]){
    const out=request(endpoint);
    expect(out.statusCode).toBe(503);
    expect(out.body).toEqual({error:'public_origin_required'});
    expect(JSON.stringify(out.body)).not.toMatch(/attacker|issuer|authorization_endpoint|registration_endpoint|resource.*http/);
    expect(out.headers['Cache-Control']).toBe('no-store');
   }
  }
 });
});
