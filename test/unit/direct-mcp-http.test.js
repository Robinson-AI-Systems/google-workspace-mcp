import {describe,it,expect,vi,beforeAll,afterAll} from 'vitest';
import {createServer} from 'node:http';
import {createFakeDb} from '../helpers/fake-db.js';
import {Client} from '@modelcontextprotocol/sdk/client/index.js';
import {StreamableHTTPClientTransport} from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const holder=vi.hoisted(()=>({db:null}));
vi.mock('../../src/db.js',async importActual=>{
 const real=await importActual();
 return Object.fromEntries(Object.keys(real).map(n=>[n,(...args)=>holder.db[n](...args)]));
});
vi.mock('../../src/auth/google-auth-hosted.js',()=>({
 ensureMigrated:async()=>{},
 buildHostedApiClients:async account=>({actingAs:account,gmail:{users:{getProfile:async()=>({data:{emailAddress:account}})}}})
}));
const {default:handler,trustedMcpOrigin}=await import('../../api/mcp.js');
let server,origin,token;
beforeAll(async()=>{
 holder.db=createFakeDb();
 await holder.db.saveGoogleTokensFor('ops@example.test',{access_token:'fixture-access'});
 token='oauth-connector-synthetic-test';
 await holder.db.createAccessToken({accessToken:token,clientId:'local-test-client',
  googleAccount:'ops@example.test',profile:'read_only',listing:'catalog',areas:['workspace','mail']});
 process.env.PUBLIC_BASE_URL='https://workspace.example.test';
 server=createServer(async(req,res)=>{
  const chunks=[];for await(const chunk of req)chunks.push(chunk);
  if(chunks.length){try{req.body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}
   catch{res.statusCode=400;res.end();return;}}
  res.status=function(n){this.statusCode=n;return this;};
  res.json=function(v){this.setHeader('content-type','application/json');this.end(JSON.stringify(v));return this;};
  try{await handler(req,res);}catch{
   if(!res.headersSent){res.statusCode=500;res.end(JSON.stringify({error:'unexpected'}));}
  }
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 origin='http://127.0.0.1:'+server.address().port;
});
afterAll(async()=>{
 if(server)await new Promise(resolve=>server.close(resolve));
});
describe('standalone direct MCP owner-origin and bearer trust',()=>{
 it('rejects unsafe OAuth metadata origins independently of arbitrary request host',()=>{
  expect(trustedMcpOrigin('https://workspace.example.test')).toBe('https://workspace.example.test');
  for(const bad of [undefined,'','http://workspace.example.test','https://user:pw@workspace.example.test',
   'https://workspace.example.test/evil','https://workspace.example.test?q=x',
   'https://workspace.example.test#fragment','https://workspace.example.test:444',
   'javascript:alert(1)','not a URL']){
    expect(trustedMcpOrigin(bad)).toBeNull();
  }
 });
 it('refuses missing OAuth bearer and advertises only configured HTTPS metadata despite hostile Host',async()=>{
  const r=await fetch(origin+'/api/mcp',{method:'POST',
   headers:{host:'malicious.example.test','content-type':'application/json',
    accept:'application/json, text/event-stream'},
   body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list',params:{}})});
  expect(r.status).toBe(401);
  expect(r.headers.get('www-authenticate')).toBe('Bearer resource_metadata="https://workspace.example.test/.well-known/oauth-protected-resource"');
  expect(await r.json()).toMatchObject({error:'unauthorized'});
 });
 it('never uses an untrusted Host as fallback when owner has no origin configured',async()=>{
  const saved=process.env.PUBLIC_BASE_URL;
  try{
   delete process.env.PUBLIC_BASE_URL;
   const r=await fetch(origin+'/api/mcp',{headers:{host:'attacker.example.test'}});
   expect(r.status).toBe(401);
   expect(r.headers.get('www-authenticate')).toBeNull();
  }finally{process.env.PUBLIC_BASE_URL=saved;}
 });
 it('refuses an unrelated bearer even when it resembles a service RTC pass',async()=>{
  const r=await fetch(origin+'/api/mcp',{headers:{authorization:'Bearer rtc_pass_'+'A'.repeat(43)}});
  expect(r.status).toBe(401);expect(await r.json()).toMatchObject({error:'invalid_token'});
 });
 it('connects the real standalone MCP SDK, lists scoped tools and invokes a harmless account read',async()=>{
  const transport=new StreamableHTTPClientTransport(new URL(origin+'/api/mcp'),{
   requestInit:{headers:{authorization:'Bearer '+token}}
  });
  const client=new Client({name:'standalone-parity-test',version:'1.0.0'},{capabilities:{}});
  try{
   await client.connect(transport);
   const listing=await client.listTools();
   expect(listing.tools.length).toBeGreaterThan(0);
   expect(listing.tools.some(t=>t.name==='workspace_list_accounts')).toBe(true);
   expect(listing.tools.some(t=>t.name==='gmail_send_email')).toBe(false);
   const read=await client.callTool({name:'workspace_list_accounts',arguments:{}});
   expect(read.isError).not.toBe(true);
   const data=JSON.parse(read.content[0].text);
   expect(data.some(a=>a.email==='ops@example.test')).toBe(true);
   const denied=await client.callTool({name:'gmail_send_email',arguments:{confirm:true}});
   expect(denied.isError).toBe(true);
  }finally{await client.close();}
 });
});
