import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {registry} from '../../src/tools/index.js';
import {allowedTool,LEGACY_OWNER_ONLY_TOOLS} from '../../src/rtc/catalog.js';
const read=path=>readFileSync(new URL('../../'+path,import.meta.url),'utf8');
const matrix=JSON.parse(read('docs/plan/evidence/p10-caller-matrix.json'));
const policy={principalKind:'user',profile:'full',listing:'catalog',areas:null,mode:'live'};
describe('P10-4 machine-checked every registered tool-module storage/client boundary',()=>{
 it('covers every actual imported tool module exactly once and every declared module implements tools',async()=>{
  const source=read('src/tools/index.js');
  const discovered=[...source.matchAll(/import \* as \w+ from '\.\/([^']+\.js)'/g)]
    .map(m=>'src/tools/'+m[1]).sort();
  expect(matrix.modules.map(row=>row.path).sort()).toEqual(discovered);
  expect(discovered).toHaveLength(matrix.expectedModuleCount);
  const catalog=new Set(registry.tools.map(t=>t.name));
  for(const row of matrix.modules){
    const module=await import('../../'+row.path);
    expect(module.tools.length,row.path).toBeGreaterThan(0);
    for(const tool of module.tools)expect(catalog.has(tool.name),row.path+':'+tool.name).toBe(true);
  }
 });
 it('prevents owner business, TEST-fixture or Vercel-provider tools being exposed to unrelated public principals',async()=>{
  for(const row of matrix.modules.filter(row=>['ownerBusiness','ownerTest','ownerExternal'].includes(row.classification))){
    const module=await import('../../'+row.path);
    for(const tool of module.tools){
      expect(LEGACY_OWNER_ONLY_TOOLS.has(tool.name),row.path+':'+tool.name).toBe(true);
      expect(allowedTool(tool.name,policy),row.path+':'+tool.name).toBe(false);
    }
  }
 });
 it('no newly exposed plain provider module may depend on an owner-global DB, private business map or service key',()=>{
  const db=/from\s*['"]\.\.\/db\.js['"]|import\(['"]\.\.\/db\.js['"]\)/;
  const biz=/from\s*['"]\.\.\/businesses\.js['"]/;
  const legacyDelegation=/from\s*['"]\.\.\/auth\/service-account\.js['"]/;
  for(const row of matrix.modules){
    const source=read(row.path);
    if(row.classification==='oauthProvider'){
      expect(db.test(source),row.path+' global DB import').toBe(false);
      expect(biz.test(source),row.path+' global business import').toBe(false);
      expect(legacyDelegation.test(source),row.path+' global delegated client').toBe(false);
    }
    if(row.classification==='scopedLegacy')
      expect(/clients\?\.store|clients\.store/.test(source),row.path+' missing scoped branch').toBe(true);
    if(row.classification==='customerWorkflow')
      expect(source.includes('clients?.store ? null'),row.path+' public owner map leak').toBe(true);
  }
 });
 it('also records the critical nonregistry constructors and actual live/owner gates',()=>{
  const listed=new Set(matrix.nonRegistryCritical.map(x=>x.path));
  for(const path of ['api/mcp.js','src/principals/tenant-store.js','src/principals/clients.js',
    'src/principals/delegation.js','src/tools/guards-admin.js','src/rtc/results.js'])
    expect(listed.has(path)).toBe(true);
  expect(read('api/mcp.js')).toContain('PUBLIC_P10_TOOL_EXECUTION_VERIFIED');
  expect(read('src/principals/clients.js')).toContain('publicGoogleClient()');
  expect(read('src/principals/delegation.js')).toContain('verifiedAdmin');
 });
});
