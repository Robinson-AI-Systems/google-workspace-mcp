import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {manifest,toExternal} from '../../api/rtc-gateway.js';
import {rtcOpenapi} from '../../src/rtc/openapi.js';
import {registry} from '../../src/tools/index.js';
import {RTC_AREAS,RTC_META,allowedTool,listedTools,toolMetadata} from '../../src/rtc/catalog.js';

describe('Hub-neutral RTC 1 provider compatibility (not Hub enrollment acceptance)',()=>{
 it('advertises independently discoverable RTC1 contract, stable prefix and LIVE in original provider modes',()=>{
  const c=manifest();
  expect(c).toMatchObject({rtc:1,server:'google-workspace-mcp',prefix:'workspace',
   profiles:['read_only','everyday','full'],listingModes:['catalog','compact'],
   modes:['test','live'],devTools:true,counts:{tools:registry.tools.length}});
  expect(c.areas).toEqual(RTC_AREAS);
  expect(c.counts.tools).toBeGreaterThan(350);
  expect(c.counts.writes).toBeGreaterThan(0);
  expect(c.counts.money).toBe(0);
  // A Hub relay's acceptance state is not a truthful provider capability
  // and is not a required RTC1 manifest field.
  expect(c).not.toHaveProperty('conformance');
  const openapi=rtcOpenapi('https://workspace.example.test');
  const schema=openapi.components.schemas.Manifest;
  // The RTC1 public manifest and its required OpenAPI fields must stay
  // byte-for-byte aligned; removing a Hub-owned status must not leave a
  // stale required property in a generated client contract.
  expect(schema).not.toHaveProperty('properties.conformance');
  expect([...schema.required].sort()).toEqual(Object.keys(c).sort());
  expect(Object.keys(schema.properties).sort()).toEqual(Object.keys(c).sort());
 });
 it('preserves direct MCP and prefixed HTTPS discovery doors without needing the Hub',()=>{
  const routes=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url),'utf8'));
  const sources=routes.rewrites.map(r=>r.source);
  expect(sources).toContain('/api/contract');
  expect(sources).toContain('/api/tools');
  expect(sources).toContain('/api/tools/:tool');
  expect(sources).toContain('/api/results/:result');
  expect(sources).toContain('/.well-known/oauth-protected-resource');
  const spec=rtcOpenapi('https://workspace.example.test');
  expect(spec.paths['/api/tools'].get).toBeDefined();
  expect(spec.paths['/api/tools/{name}'].get).toBeDefined();
  expect(spec.paths['/api/tools/{name}'].post).toBeDefined();
  expect(spec.paths['/api/results/{handle}'].get).toBeDefined();
  // Manifest and its published OpenAPI schema must agree exactly: clients
  // may validate the public manifest without any Hub-specific integration.
  expect(spec.components.schemas.Manifest.properties).not.toHaveProperty('conformance');
  expect(spec.components.schemas.Manifest.required).not.toContain('conformance');
  expect(Object.keys(manifest()).sort()).toEqual(
   Object.keys(spec.components.schemas.Manifest.properties).sort());
  expect(registry.tools.every(t=>toExternal(t.name).startsWith('workspace_'))).toBe(true);
 });
 it('applies original provider scope guard before Hub can discover or dispatch',()=>{
  const restricted={profile:'read_only',mode:'live',areas:['mail'],allow_writes:false};
  const listed=listedTools(registry.tools,restricted,'catalog');
  expect(listed.length).toBeGreaterThan(0);
  expect(listed.some(t=>t.name==='gmail_list_labels')).toBe(true);
  expect(listed.some(t=>t.name==='gmail_send_email')).toBe(false);
  expect(listed.some(t=>t.name==='drive_list_files')).toBe(false);
  expect(allowedTool('workspace_dev_cleanup',{mode:'live',profile:'full',allow_writes:true})).toBe(false);
  expect(allowedTool('gmail_send_email',restricted)).toBe(false);
  const dispatcher=toolMetadata(registry.tools.find(t=>t.name==='workspace_call'),restricted);
  expect(RTC_META.has('workspace_call')).toBe(true);
  expect(dispatcher.writes).toBe(true); // inner call independently rechecked
  expect(dispatcher.annotations.readOnlyHint).toBe(false);
  expect(listed.every(t=>toExternal(t.name).startsWith('workspace_'))).toBe(true);
 });
});
