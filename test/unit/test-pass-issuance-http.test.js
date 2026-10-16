import {describe,it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
const holder=vi.hoisted(()=>({calls:0}));
vi.mock('../../src/db.js',()=>({initSchema:async()=>{holder.calls++;throw Error('no database expected');},getOAuthClient:vi.fn(),recordLoginAttempt:vi.fn(),countRecentFailedLogins:vi.fn(),markLoginAttemptSucceeded:vi.fn()}));
const {default:handler}=await import('../../api/developer/test-pass-issue.js');
const response=()=>({headers:{},statusCode:0,setHeader(k,v){this.headers[k]=v;},status(n){this.statusCode=n;return this;},json(v){this.data=v;return this;}});
describe('encrypted issuance HTTP boundary',()=>{
 it('refuses unsupported methods and oversized parsed/raw bodies before any database call',async()=>{
  for(const req of [{method:'DELETE',headers:{}},{method:'POST',headers:{'content-length':'4097'},body:{}},{method:'POST',headers:{},body:{text:'x'.repeat(4097)}}]){
   const res=response();await handler(req,res);expect([405,413]).toContain(res.statusCode);expect(res.headers['Cache-Control']).toBe('no-store');
  }
  const req=Readable.from(['x'.repeat(4097)]);req.method='POST';req.headers={'content-type':'application/x-www-form-urlencoded'};const res=response();await handler(req,res);expect(res.statusCode).toBe(413);expect(holder.calls).toBe(0);
 });
 it('masks malformed JSON without echoing submitted credentials',async()=>{
  const req=Readable.from(['{"passphrase":"fake-sensitive-value"']);req.method='POST';req.headers={'content-type':'application/json'};
  const res=response();await handler(req,res);expect(res.statusCode).toBe(503);expect(JSON.stringify(res.data)).not.toContain('fake-sensitive-value');expect(holder.calls).toBe(0);
 });
});
