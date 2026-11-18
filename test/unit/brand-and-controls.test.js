// BRAND-1 / CONTROLS-1 / ONE-DOOR (owner rulings 2026-11-09).
// One Workspace Unleashed look on every page (company tokens + Violet), no
// other business's brand anywhere, plain words, the controls people asked for,
// and access-level wording that matches what the code actually enforces.
import {describe,it,expect} from 'vitest';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {join} from 'node:path';
import {BRAND,BRAND_CSS,brandPage,assetBytes} from '../../src/brand/brand.js';
import {ACCESS_LEVELS} from '../../src/brand/access-levels.js';
import {allowedTool} from '../../src/rtc/catalog.js';
import brandAsset from '../../api/brand.js';
import {pageHtml,homeInfo,supportInfo,privacyInfo,deletionInfo} from '../../src/principals/public-information.js';

const walk=dir=>readdirSync(dir).flatMap(name=>{const p=join(dir,name);return statSync(p).isDirectory()?walk(p):[p];});
const res=()=>{const x={statusCode:200,headers:{},body:null};x.setHeader=(k,v)=>{x.headers[k]=v;};
 x.status=n=>{x.statusCode=n;return x;};x.send=v=>{x.body=v;return x;};x.end=()=>x;return x;};

describe('one brand: Robinson AI Systems tokens with the Workspace Violet accent',()=>{
 it('the shell carries company tokens, Violet, the product mark and the reassurance line',()=>{
  const html=brandPage('Test','<p>x</p>');
  for(const token of ['#0C0C0C','#1E1E1E','#F8FAF8','#9FA5A3','#00B67A','#00E3C2','#9A7BFF'])expect(html).toContain(token);
  expect(html).toContain('/brand/unleashed-workspace.png');
  expect(html).toContain('We never ask for your Google password here.');
  expect(html).toContain('trademark of Google LLC');
  expect(BRAND.violet).toBe('#9A7BFF');
 });
 it('no other business brand and no outside font request appears anywhere in served source',()=>{
  const files=[...walk('api'),...walk('src')].filter(p=>/\.(m?js)$/.test(p));
  for(const file of files){
   const text=readFileSync(file,'utf8').replace(/\/\/.*$/gm,'');
   for(const leaked of ['#F7F5EC','#123C2D','#17251E','fonts.googleapis.com/css','#4DDFFF'])
    expect(text.includes(leaked),file+' contains '+leaked).toBe(false);
  }
  expect(BRAND_CSS).not.toMatch(/@import|url\(http/);
 });
 it('serves the mark, the company icon and the favicon as PNG, and nothing else',async()=>{
  for(const asset of ['unleashed-workspace.png','icon-256.png','icon-64.png','favicon.ico']){
   const out=res();brandAsset({method:'GET',query:{asset}},out);
   expect(out.statusCode).toBe(200);expect(out.headers['Content-Type']).toBe('image/png');
   expect(Buffer.from(out.body).subarray(1,4).toString()).toBe('PNG');
  }
  for(const asset of ['../package.json','secret.png','']){
   const out=res();brandAsset({method:'GET',query:{asset}},out);expect(out.statusCode).toBe(404);
  }
  expect(assetBytes('/brand/nope.png')).toBeNull();
 });
});

describe('public pages: outcome first, plain words, nothing internal',()=>{
 const pages=()=>[pageHtml('Workspace Unleashed by Robinson AI Systems',homeInfo({PUBLIC_BASE_URL:'https://ws.example.test'})),
  pageHtml('Support',supportInfo({})),pageHtml('Privacy',privacyInfo),pageHtml('Delete',deletionInfo)];
 it('home leads with what it does, then how to connect each app, with the full address',()=>{
  const home=pages()[0];
  expect(home).toContain('Let your AI assistant work with your Google Workspace, safely');
  expect(home).toContain('https://ws.example.test/api/mcp');
  expect(home.indexOf('safely')).toBeLessThan(home.indexOf('Connect your AI app'));
  expect(home).toContain('How connecting works');
  expect(home.indexOf('How connecting works')).toBeLessThan(home.indexOf('Connect your AI app'));
  expect(home).toContain('/api/auth/google/start?purpose=login');
  expect(home).toContain('href="#connect"');
  // Every command and file snippet carries the real address.
  expect(home).not.toContain('YOUR-ADDRESS');
  expect((home.match(/https:\/\/ws\.example\.test\/api\/mcp/g)||[]).length).toBeGreaterThanOrEqual(6);
  for(const app of ['Claude','ChatGPT','Muse','Claude Code','OpenAI Codex','Cursor','VS Code','Gemini CLI','Windsurf','Any other app'])expect(home).toContain('<h3>'+app);
 });
 it('no public page shows internal language or an operator to-do',()=>{
  for(const page of pages()){
   const words=page.replace(/<[^>]+>/g,' ');
   for(const banned of [/\bpilot\b/i,/principal/i,/cross-principal/i,/approved Google account/i,/PUBLIC_SUPPORT_EMAIL/,/God mode/i,/prelaunch/i,/operator must/i])
    expect(words).not.toMatch(banned);
  }
 });
});

describe('access-level wording matches what each level actually allows',()=>{
 const write=(name)=>({full:allowedTool(name,{profile:'full'}),everyday:allowedTool(name,{profile:'everyday'}),read_only:allowedTool(name,{profile:'read_only'})});
 it('Read only blocks every change; Everyday blocks admin, domain, DNS and licensing changes only; Full blocks none',()=>{
  expect(write('gmail_send')).toEqual({full:true,everyday:true,read_only:false});
  expect(write('calendar_create_event')).toEqual({full:true,everyday:true,read_only:false});
  expect(write('admin_create_user')).toEqual({full:true,everyday:false,read_only:false});
  expect(write('dns_create_record')).toEqual({full:true,everyday:false,read_only:false});
  expect(write('licensing_assign')).toEqual({full:true,everyday:false,read_only:false});
  const says=Object.fromEntries(ACCESS_LEVELS.map(l=>[l.id,l.says]));
  expect(says.read_only).toMatch(/cannot change anything/);
  expect(says.everyday).toMatch(/not admin, domain, DNS or licensing/);
  expect(says.full).toMatch(/everywhere your Google account allows/);
 });
 it('the person\'s "make all my apps read-only" switch blocks every change on every level',()=>{
  for(const profile of ['full','everyday'])expect(allowedTool('gmail_send',{profile,allow_writes:false})).toBe(false);
  expect(allowedTool('workspace_search_tools',{profile:'full',allow_writes:false})).toBe(true);
 });
});
