import {it,expect,vi} from 'vitest';
import {Readable} from 'node:stream';
const spies=vi.hoisted(()=>({query:vi.fn(async()=>[]),init:vi.fn(async()=>{})}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>({query:spies.query})}));
vi.mock('../../src/db.js',()=>({initSchema:spies.init,getOAuthClient:vi.fn(),getRtcPass:vi.fn(),recordLoginAttempt:vi.fn(),countRecentFailedLogins:vi.fn(),markLoginAttemptSucceeded:vi.fn()}));
import endpoint from '../../api/developer/test-pass.js';
const response=()=>({setHeader(){},status(n){this.code=n;return this;},json(v){this.data=v;},send(v){this.data=v;}});
it('handles actual bounded URL-encoded form input and preserves the strict Origin refusal',async()=>{
 const old=process.env.PUBLIC_BASE_URL;process.env.PUBLIC_BASE_URL='https://service.example';
 try{
  spies.query.mockImplementation(async text=>text.startsWith('SELECT')?[{client_id:'rtc-pass:registered',challenge:'pass_'+'a'.repeat(20),expires_at:new Date(Date.now()+60000)}]:[]);
  const req=Readable.from(['state='+'a'.repeat(43)+'&token=rtc_pass_'+'b'.repeat(43)]);Object.assign(req,{method:'POST',headers:{origin:'https://foreign.example','content-type':'application/x-www-form-urlencoded'}});
  const res=response();await endpoint(req,res);expect(res.code).toBe(403);expect(res.data.error).toBe('origin_refused');
 }finally{if(old===undefined)delete process.env.PUBLIC_BASE_URL;else process.env.PUBLIC_BASE_URL=old;}
});
it('refuses oversized declared and streamed bodies before schema access, and unsupported methods',async()=>{
 spies.query.mockClear();spies.init.mockClear();
 for(const req of [{method:'POST',headers:{'content-length':'4097'}},Object.assign(Readable.from(['x'.repeat(4097)]),{method:'POST',headers:{}})]){
  const res=response();await endpoint(req,res);expect(res.code).toBe(413);
 }
 const res=response();await endpoint({method:'DELETE',headers:{}},res);expect(res.code).toBe(405);expect(spies.init).not.toHaveBeenCalled();expect(spies.query).not.toHaveBeenCalled();
});
