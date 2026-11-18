// Named connector addresses (2026-11-09): /api/mcp/<name> lets one person add
// Workspace more than once in apps that allow one connector per address
// (Claude). Same server, same rules; each connection is bound to its address.
import {describe,it,expect,beforeEach} from 'vitest';
import {acceptedResource,validConnectorName,mcpResource} from '../../src/oauth/connector-address.js';
import {resolveRoute} from '../../rack-server.mjs';
import prm from '../../api/well-known/oauth-protected-resource.js';
const BASE='https://workspace.example.test';
const res=()=>{const x={statusCode:200,headers:{},body:null};x.setHeader=(k,v)=>{x.headers[k]=v;};x.getHeader=k=>x.headers[k];
 x.status=n=>{x.statusCode=n;return x;};x.json=v=>{x.body=v;return x;};x.send=v=>{x.body=v;return x;};
 x.writeHead=(n,h={})=>{x.statusCode=n;Object.assign(x.headers,h);return x;};x.end=v=>{if(v)x.body=v;return x;};return x;};
beforeEach(()=>{process.env.PUBLIC_BASE_URL=BASE;});

describe('which addresses count as this server',()=>{
 it('the plain address, an omitted one, and a named one; nothing else',()=>{
  expect(acceptedResource(BASE+'/api/mcp')).toBe(BASE+'/api/mcp');
  expect(acceptedResource(undefined)).toBe(BASE+'/api/mcp');
  expect(acceptedResource('')).toBe(BASE+'/api/mcp');
  expect(acceptedResource(BASE+'/api/mcp/test')).toBe(BASE+'/api/mcp/test');
  expect(acceptedResource(BASE+'/api/mcp/work-2')).toBe(BASE+'/api/mcp/work-2');
  for(const bad of [BASE+'/api/mcp/', BASE+'/api/mcp/a/b', BASE+'/api/mcp/Test', BASE+'/api/mcp/-x', BASE+'/api/mcp/'+'a'.repeat(32),
   BASE+'/api/mcp/test?x=1', BASE+'/api/mcpx', 'https://evil.example/api/mcp/test', BASE+'/api/mcp/..'])
   expect(acceptedResource(bad),bad).toBeNull();
  expect(validConnectorName('personal')).toBe(true);
  expect(mcpResource('test')).toBe(BASE+'/api/mcp/test');
 });
});

describe('a named address works end to end on the server side',()=>{
 it('routes the address and its own metadata document',()=>{
  expect(resolveRoute('/api/mcp/test').query).toEqual({connector:'test'});
  expect(resolveRoute('/.well-known/oauth-protected-resource/api/mcp/test').query).toEqual({connector:'test'});
  expect(resolveRoute('/api/mcp/Bad_Name')).toBeNull();
 });
 it('its metadata document names that exact address',()=>{
  const out=res();prm({method:'GET',query:{connector:'test'},headers:{}},out);
  expect(out.body).toEqual({resource:BASE+'/api/mcp/test',authorization_servers:[BASE]});
  const plain=res();prm({method:'GET',query:{},headers:{}},plain);
  expect(plain.body.resource).toBe(BASE+'/api/mcp');
 });
});
