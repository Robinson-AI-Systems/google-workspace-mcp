import {describe,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
const h=vi.hoisted(()=>({principalConsume:0,refresh:0}));
vi.mock('../../src/db.js',()=>({
 initSchema:async()=>{},
 getOAuthClient:async id=> id==='muse'?{client_id:'muse',client_secret:null,redirect_uris:['https://agent.meta.ai/api/hatch/oauth/callback']}:
 id==='legacy'?{client_id:'legacy',client_secret:'legacy-secret'}:null
}));
vi.mock('../../src/principals/store.js',()=>({
 consumePrincipalCode:async values=>{h.principalConsume++;return values.clientId==='muse'&&
 values.redirectUri==='https://agent.meta.ai/api/hatch/oauth/callback'&&values.verifier==='A'.repeat(43)?
 {principal_id:'test',client_id:'muse'}:null;},
 issuePrincipalConnection:async()=>({accessToken:'muse-access',refreshToken:'muse-refresh'}),
 rotatePrincipalRefresh:async(_token,values)=>{h.refresh++;return values.clientId==='muse'?{accessToken:'new-access',refreshToken:'new-refresh'}:null;}
}));
const {default:token}=await import('../../api/oauth/token.js');
function res(){
 const x={statusCode:200,body:null};
 x.status=n=>{x.statusCode=n;return x;};
 x.json=body=>{x.body=body;return x;};
 return x;
}
async function call(body){
 const req=Readable.from([new URLSearchParams(body).toString()]);
 req.method='POST';req.headers={'content-type':'application/x-www-form-urlencoded'};
 const out=res();await token(req,out);return out;
}
describe('Muse public OAuth token compatibility',()=>{
 const old=process.env.PUBLIC_BASE_URL;
 it('accepts only Muse with omitted resource, proper registered callback and PKCE verifier',async()=>{
  process.env.PUBLIC_BASE_URL='https://mcp.example.test';
  try{
   h.principalConsume=0;
   const base={grant_type:'authorization_code',client_id:'muse',code:'p10c_fake',redirect_uri:'https://agent.meta.ai/api/hatch/oauth/callback',code_verifier:'A'.repeat(43)};
   const valid=await call(base);
   expect(valid.statusCode).toBe(200);
   expect(valid.body.refresh_token).toBe('muse-refresh');
   const foreign=await call({...base,resource:'https://evil.example.test/api/mcp'});
   expect(foreign.statusCode).toBe(400);
   expect(foreign.body.error).toBe('invalid_target');
   const badCallback=await call({...base,redirect_uri:'https://evil.example.test/callback'});
   expect(badCallback.statusCode).toBe(400);
   expect(h.principalConsume).toBe(2);
   const legacy=await call({...base,client_id:'legacy'});
   expect(legacy.statusCode).toBe(400);
   expect(legacy.body.error).toBe('invalid_target');
  }finally{
   if(old===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=old;
  }
 });
 it('does not allow foreign client refresh or foreign resource',async()=>{
  process.env.PUBLIC_BASE_URL='https://mcp.example.test';
  try{
   h.refresh=0;
   const base={grant_type:'refresh_token',client_id:'muse',refresh_token:'p10r_dummy'};
   expect((await call(base)).statusCode).toBe(200);
   const denied=await call({...base,resource:'https://foreign.example.test/api/mcp'});
   expect(denied.statusCode).toBe(400);
   expect(denied.body.error).toBe('invalid_target');
   expect(h.refresh).toBe(1);
  }finally{
   if(old===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=old;
  }
 });
});
