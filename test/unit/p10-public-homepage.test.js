import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import homepage from '../../api/index.js';

const response=()=>{
  const out={statusCode:200,headers:{},body:null,ended:false};
  out.setHeader=(key,value)=>{out.headers[key]=value;};
  out.status=value=>{out.statusCode=value;return out;};
  out.send=value=>{out.body=value;out.ended=true;return out;};
  out.end=()=>{out.ended=true;return out;};
  return out;
};

describe('P10 anonymous root entrypoint respects legacy-owner account privacy',()=>{
  it('never imports or initializes the unscoped owner account database/Google/registry',()=>{
    const source=readFileSync(new URL('../../api/index.js',import.meta.url),'utf8');
    expect(source).not.toMatch(/(?:listGoogleAccounts|ensureMigrated|initSchema|from\s+['"][^'"]*(?:db\.js|google-auth-hosted\.js|tools\/index\.js))/);
  });
  it('GET renders only public service guidance and an authenticated-portal link',()=>{
    const privateMarker='owner-private-mailbox@example.test';
    const out=response();
    homepage({method:'GET',query:{email:privateMarker},accounts:[{email:privateMarker}]},out);
    expect(out.statusCode).toBe(200);
    expect(out.ended).toBe(true);
    expect(out.body).toContain('Robinson Google Workspace MCP');
    expect(out.body).toContain('/api/account');
    expect(out.body).toContain('/api/mcp');
    expect(out.body).not.toContain(privateMarker);
    expect(out.body).not.toContain('Connected Google accounts');
    expect(out.headers['Content-Type']).toBe('text/html; charset=utf-8');
    expect(out.headers['Cache-Control']).toContain('no-store');
    expect(out.headers['Content-Security-Policy']).toContain("default-src 'none'");
    expect(out.headers['Referrer-Policy']).toBe('no-referrer');
  });
  it('HEAD has no response body, and unsupported methods cannot run data operations',()=>{
    const head=response();
    homepage({method:'HEAD'},head);
    expect(head.statusCode).toBe(200);
    expect(head.ended).toBe(true);
    expect(head.body).toBeNull();

    const post=response();
    homepage({method:'POST',body:{google_account:'owner-private-mailbox@example.test'}},post);
    expect(post.statusCode).toBe(405);
    expect(post.headers.Allow).toBe('GET, HEAD');
    expect(post.body).toBe('Method not allowed');
    expect(post.body).not.toContain('owner-private-mailbox');
  });
});
