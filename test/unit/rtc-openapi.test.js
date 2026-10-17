import { describe, expect, it } from 'vitest';
import { rtcOpenapi } from '../../src/rtc/openapi.js';
import { readFileSync } from 'node:fs';
const spec=rtcOpenapi('https://workspace.example.test');
const methods=['get','post','put','patch','delete'];
const operations=Object.entries(spec.paths).flatMap(([path,item])=>methods.filter(method=>item[method]).map(method=>({path,method,...item[method]})));
describe('P8-4 complete generic OpenAPI document',()=>{
 it('documents every checked-in RTC rewrite with eight unique generic operations, no provider schema explosion',()=>{
  const config=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'));
  const expected=config.rewrites.filter(r=>r.destination.startsWith('/api/rtc-gateway')).map(r=>r.source.replace(':tool','{name}').replace(':result','{handle}'));
  for(const path of expected)expect(spec.paths[path]).toBeDefined();
  expect(operations).toHaveLength(8);
  expect(new Set(operations.map(x=>x.operationId)).size).toBe(8);
  expect(operations.every(x=>x.responses?.['200']?.content?.['application/json']?.schema)).toBe(true);
 });
 it('requires bearer passes except for the two public metadata endpoints',()=>{
  expect(spec.security).toEqual([{rtcPass:[]}]);
  expect(spec.components.securitySchemes.rtcPass.scheme).toBe('bearer');
  expect(operations.filter(x=>x.security?.length===0).map(x=>x.path)).toEqual(['/api/contract','/api/openapi.json']);
  for(const op of operations.filter(x=>x.security===undefined)){
   expect(op.responses['401']).toBeDefined();
   expect(op.responses['429'].headers['Retry-After']).toBeDefined();
  }
 });
 it('resolves every schema reference locally and defines both raw/public and enveloped/authenticated results',()=>{
  function walk(value){
   if(!value||typeof value!=='object')return;
   if(value.$ref){
    expect(value.$ref).toMatch(/^#\/components\/schemas\//);
    expect(spec.components.schemas[value.$ref.split('/').at(-1)]).toBeDefined();
   }
   Object.values(value).forEach(walk);
  }
  walk(spec);
  expect(spec.paths['/api/contract'].get.responses['200'].content['application/json'].schema).toEqual({$ref:'#/components/schemas/Manifest'});
  const identity=spec.paths['/api/whoami'].get.responses['200'].content['application/json'].schema;
  expect(identity.required).toEqual(['ok','result','mode']);
  expect(identity.properties.result).toEqual({$ref:'#/components/schemas/Identity'});
  expect(identity.properties.mode.enum).toEqual(['test','live']);
  expect(spec.components.schemas.Manifest.properties.modes.items.enum).toEqual(['test','live']);
 });
 it('documents actual string projection, numbered UTF-8 recovery, guarded writes and bounded batches',()=>{
  const retrieval=spec.paths['/api/results/{handle}'].get;
  expect(retrieval.parameters.find(x=>x.name==='fields').schema.type).toBe('string');
  expect(retrieval.parameters.find(x=>x.name==='page').schema.default).toBe(1);
  expect(spec.components.schemas.StoredResult.oneOf[0].required).toContain('content');
  expect(spec.components.schemas.StoredResult.oneOf[1].required).toContain('payload');
  const calls=spec.paths['/api/tools/_batch'].post.requestBody.content['application/json'].schema.properties.calls;
  expect(spec.paths['/api/tools'].get.parameters.some(p=>p.name==='showUnavailable')).toBe(true);
  expect(spec.paths['/api/tools/{name}'].get.parameters.some(p=>p.name==='showUnavailable')).toBe(true);
  expect(calls.maxItems).toBe(10);expect(calls.items.required).toEqual(['name']);
  expect(spec.paths['/api/tools/{name}'].post.description).toMatch(/confirmed.*logged/);
  expect(spec.paths['/api/tools/_batch'].post.description).toContain('no changing tool');
 });
 it('uses only an exact configured HTTPS origin or the serving origin',()=>{
  expect(spec.servers).toEqual([{url:'https://workspace.example.test'}]);
  for(const bad of ['',undefined,'http://insecure.test','https://user:secret@host.test','https://host.test/path','https://host.test/?x=1','javascript:alert(1)'])
   expect(rtcOpenapi(bad).servers).toEqual([{url:'/'}]);
 });
});
