import {describe,it,expect,vi,beforeEach} from 'vitest';
import {Readable} from 'node:stream';
import crypto from 'node:crypto';
import {verifyPkce} from '../../src/oauth/helpers.js';

const state=vi.hoisted(()=>({
 clients:new Map([['owner-client',{client_id:'owner-client',client_secret:'owner-secret'}],
  ['user-client',{client_id:'user-client',client_secret:'user-secret'}]]),
 legacyCalls:[],userCalls:[]
}));
vi.mock('../../src/db.js',()=>({
 initSchema:async()=>{},
 getOAuthClient:async id=>state.clients.get(id)||null,
 revokeClientOAuthToken:async(token,id)=>{state.legacyCalls.push({token,id});return 1;}
}));
vi.mock('../../src/principals/store.js',()=>({
 revokeClientPrincipalToken:async(token,id)=>{state.userCalls.push({token,id});return 1;}
}));
const {default:revoke}=await import('../../api/oauth/revoke.js');

function res(){
 const r={statusCode:200,headers:{},body:null};
 r.setHeader=(k,v)=>{r.headers[k]=v;};
 r.status=n=>{r.statusCode=n;return r;};
 r.json=v=>{r.body=v;return r;};
 return r;
}
async function call(data,method='POST'){
 const req=Readable.from([new URLSearchParams(data).toString()]);
 req.method=method;req.headers={'content-type':'application/x-www-form-urlencoded'};
 const out=res();await revoke(req,out);return out;
}
beforeEach(()=>{state.legacyCalls=[];state.userCalls=[];});

describe('OAuth S256 security contract',()=>{
 it('requires a valid verifier and cryptographic S256 proof; never accepts plain or missing challenge',()=>{
  const verifier='A'.repeat(43);
  const challenge=crypto.createHash('sha256').update(verifier).digest('base64url');
  expect(verifyPkce(verifier,challenge,'S256')).toBe(true);
  for(const [v,c,m] of [[verifier,verifier,'plain'],[verifier,challenge,'plain'],
    [verifier,null,'S256'],[null,challenge,'S256'],[verifier,challenge,null],
    [verifier,'b'.repeat(43),'S256'],['short',challenge,'S256']]){
   expect(verifyPkce(v,c,m)).toBe(false);
  }
 });
});

describe('OAuth RFC 7009 revocation route',()=>{
 it('only POST is permitted and exposes no token details',async()=>{
  const out=await call({client_id:'owner-client',client_secret:'owner-secret',token:'access-token'},'GET');
  expect(out.statusCode).toBe(405);expect(out.headers.Allow).toBe('POST');
  expect(state.legacyCalls).toHaveLength(0);
 });
 it('requires a registered client and its secret before touching token families',async()=>{
  for(const data of [
    {client_id:'unknown',token:'access-token'},
    {client_id:'owner-client',client_secret:'wrong',token:'access-token'},
    {token:'access-token'}
  ]){
   const out=await call(data);
   expect(out.statusCode).toBe(401);expect(out.body).toEqual({error:'invalid_client'});
  }
  expect(state.legacyCalls).toEqual([]);expect(state.userCalls).toEqual([]);
 });
 it('refuses missing token and routes only submitted client-bound legacy and V2 credentials',async()=>{
  const bad=await call({client_id:'owner-client',client_secret:'owner-secret'});
  expect(bad.statusCode).toBe(400);expect(bad.body.error).toBe('invalid_request');
  const owner=await call({client_id:'owner-client',client_secret:'owner-secret',token:'legacy-refresh'});
  expect(owner.statusCode).toBe(200);expect(owner.body).toEqual({});
  expect(owner.headers['Cache-Control']).toBe('no-store');
  const userToken='p10r_'+'A'.repeat(43);
  const user=await call({client_id:'user-client',client_secret:'user-secret',token:userToken});
  expect(user.statusCode).toBe(200);expect(user.body).toEqual({});
  expect(state.legacyCalls).toEqual([{token:'legacy-refresh',id:'owner-client'}]);
  expect(state.userCalls).toEqual([{token:userToken,id:'user-client'}]);
 });
});
