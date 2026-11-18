// Client compatibility (2026-11-09): what every major MCP client needs to
// connect the standard way. Claude web/desktop/phone and Claude Code, ChatGPT,
// Muse, OpenAI Codex, Cursor, Windsurf, VS Code, Gemini CLI, MCP Inspector
// and Hermes all use MCP OAuth 2.1; these are the edges where they differ.
import {describe,it,expect,vi} from 'vitest';
import {resolveCimdClient,clearCimdCache,isPublicAddress} from '../../src/oauth/cimd.js';
import {redirectAllowed,withBasicClientAuth,applyCors} from '../../src/oauth/client-compat.js';
import authorizationMetadata from '../../api/well-known/oauth-authorization-server.js';

const res=()=>{const x={statusCode:200,headers:{},body:null,ended:false};x.setHeader=(k,v)=>{x.headers[k]=v;};
 x.status=n=>{x.statusCode=n;return x;};x.json=v=>{x.body=v;return x;};x.end=()=>{x.ended=true;return x;};return x;};
const CARD='https://client.example.com/oauth/client.json';
const card=(over={})=>({client_id:CARD,client_name:'Example Client',redirect_uris:['http://127.0.0.1/callback','https://client.example.com/cb'],
 token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code'],...over});
const fetchOf=doc=>async()=>({status:200,ok:true,headers:{get:()=>null},text:async()=>JSON.stringify(doc)});
const publicDns=async()=>['93.184.216.34'];

describe('discovery advertises what the clients look for',()=>{
 it('client ID cards, Basic client auth, S256 and refresh',()=>{
  process.env.PUBLIC_BASE_URL='https://workspace.example.test';
  const out=res();authorizationMetadata({method:'GET',headers:{}},out);
  expect(out.body.client_id_metadata_document_supported).toBe(true);
  expect(out.body.token_endpoint_auth_methods_supported).toEqual(expect.arrayContaining(['none','client_secret_post','client_secret_basic']));
  expect(out.body.code_challenge_methods_supported).toEqual(['S256']);
  expect(out.body.registration_endpoint).toBe('https://workspace.example.test/api/oauth/register');
 });
});

describe('client ID cards (CIMD, D-006 MC-3)',()=>{
 it('a valid public card resolves to a public client',async()=>{
  clearCimdCache();
  const client=await resolveCimdClient(CARD,{fetchImpl:fetchOf(card()),lookupImpl:publicDns});
  expect(client).toMatchObject({client_id:CARD,client_name:'Example Client',cimd:true,token_endpoint_auth_method:'none'});
 });
 it("accepts Claude's real card, which lists a grant type this server does not offer (2026-11-09 live refusal)",async()=>{
  clearCimdCache();
  const claude={client_id:'https://claude.ai/oauth/mcp-oauth-client-metadata',client_name:'Claude',client_uri:'https://claude.ai',
   redirect_uris:['https://claude.ai/api/mcp/auth_callback'],
   grant_types:['authorization_code','refresh_token','urn:ietf:params:oauth:grant-type:jwt-bearer'],
   response_types:['code'],token_endpoint_auth_method:'none'};
  const client=await resolveCimdClient(claude.client_id,{fetchImpl:fetchOf(claude),lookupImpl:publicDns});
  expect(client).toMatchObject({client_id:claude.client_id,client_name:'Claude',redirect_uris:['https://claude.ai/api/mcp/auth_callback'],cimd:true});
  clearCimdCache();
  const code={client_id:'https://claude.ai/oauth/claude-code-client-metadata',client_name:'Claude Code',client_uri:'https://claude.ai',
   redirect_uris:['http://localhost/callback','http://127.0.0.1/callback'],grant_types:['authorization_code','refresh_token'],
   response_types:['code'],token_endpoint_auth_method:'none'};
  expect(await resolveCimdClient(code.client_id,{fetchImpl:fetchOf(code),lookupImpl:publicDns})).toMatchObject({client_name:'Claude Code'});
  clearCimdCache();
  expect(await resolveCimdClient(CARD,{fetchImpl:fetchOf(card({grant_types:['refresh_token']})),lookupImpl:publicDns})).toBeNull();
 });
 it('refuses cards that lie about their address, hold a secret, or live on a private network',async()=>{
  clearCimdCache();
  expect(await resolveCimdClient(CARD,{fetchImpl:fetchOf(card({client_id:'https://other.example/x'})),lookupImpl:publicDns})).toBeNull();
  clearCimdCache();
  expect(await resolveCimdClient(CARD,{fetchImpl:fetchOf(card({client_secret:'x'})),lookupImpl:publicDns})).toBeNull();
  clearCimdCache();
  expect(await resolveCimdClient(CARD,{fetchImpl:fetchOf(card()),lookupImpl:async()=>['10.0.0.5']})).toBeNull();
  expect(await resolveCimdClient('http://client.example.com/c.json',{fetchImpl:fetchOf(card()),lookupImpl:publicDns})).toBeNull();
  expect(isPublicAddress('127.0.0.1')).toBe(false);expect(isPublicAddress('::ffff:192.168.1.1')).toBe(false);
 });
 it('a card client may use any loopback port (native apps like Claude Code); everything else matches exactly',()=>{
  const cimd={redirect_uris:['http://127.0.0.1/callback','https://client.example.com/cb'],cimd:true};
  expect(redirectAllowed(cimd,'http://127.0.0.1:53121/callback')).toBe(true);
  expect(redirectAllowed(cimd,'http://127.0.0.1:53121/other')).toBe(false);
  expect(redirectAllowed(cimd,'https://client.example.com/cb')).toBe(true);
  expect(redirectAllowed(cimd,'https://client.example.com/cb2')).toBe(false);
  const registered={redirect_uris:['http://127.0.0.1:4000/callback']};
  expect(redirectAllowed(registered,'http://127.0.0.1:4000/callback')).toBe(true);
  expect(redirectAllowed(registered,'http://127.0.0.1:5000/callback')).toBe(false);
 });
});

describe('token endpoint client authentication',()=>{
 it('HTTP Basic credentials fill in an id and secret the body left out; a body value always wins',()=>{
  const basic='Basic '+Buffer.from('client-a:s3cret%2Bvalue').toString('base64');
  expect(withBasicClientAuth({headers:{authorization:basic}},{grant_type:'authorization_code'}))
   .toMatchObject({client_id:'client-a',client_secret:'s3cret+value'});
  expect(withBasicClientAuth({headers:{authorization:basic}},{client_id:'body-id',client_secret:'body-secret'}))
   .toMatchObject({client_id:'body-id',client_secret:'body-secret'});
  expect(withBasicClientAuth({headers:{authorization:'Bearer x'}},{a:1})).toEqual({a:1});
  expect(withBasicClientAuth({headers:{}},{a:1})).toEqual({a:1});
 });
});

describe('browser-based clients (CORS)',()=>{
 it('preflight is answered and the MCP headers are exposed',async()=>{
  for(const path of ['../../api/mcp.js','../../api/oauth/token.js','../../api/oauth/register.js','../../api/oauth/revoke.js',
   '../../api/well-known/oauth-protected-resource.js','../../api/well-known/oauth-authorization-server.js']){
   const {default:handler}=await import(path);
   const out=res();await handler({method:'OPTIONS',headers:{origin:'http://localhost:6274'}},out);
   expect(out.statusCode,path).toBe(204);expect(out.ended).toBe(true);
   expect(out.headers['Access-Control-Allow-Origin']).toBe('*');
   expect(out.headers['Access-Control-Allow-Headers']).toContain('Authorization');
   expect(out.headers['Access-Control-Allow-Headers']).toContain('Mcp-Session-Id');
   expect(out.headers['Access-Control-Expose-Headers']).toContain('WWW-Authenticate');
  }
 });
 it('never claims credentials (no cookies are ever read by these endpoints)',()=>{
  const out=res();applyCors({method:'GET'},out);
  expect(out.headers['Access-Control-Allow-Credentials']).toBeUndefined();
 });
});
