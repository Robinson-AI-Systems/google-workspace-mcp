// Bounded, unauthenticated, source-pinned public-production acceptance.
// Never receives credentials, cookies, provider objects or session identifiers.
import { fileURLToPath } from 'node:url';

const SHA = /^[0-9a-f]{40}$/;
const HOSTS = new Set(['workspace.robinsonaisystems.com',
  'google-workspace-mcp-chris-projects-de6cd1bf.vercel.app']);
const LIMIT = 65536;

function assert(ok, label) { if (!ok) throw new Error(label); }
function allowed(value) {
  const u=new URL(value);
  assert(u.protocol==='https:' && !u.username && !u.password && !u.search && !u.hash &&
    !u.port && HOSTS.has(u.hostname), 'untrusted_origin_or_redirect');
  return u;
}
function fail(label) { throw new Error('FAIL '+label); }

async function retrieve(origin, path, method, requester) {
  const start=allowed(origin);
  assert(start.pathname==='/', 'invalid_origin_path');
  assert(/^\/(?:[.a-zA-Z0-9_/-]*)$/.test(path), 'invalid_public_route');
  const target=new URL(path,start);
  assert(target.origin===start.origin, 'cross_origin_route');
  const response=await requester(target.toString(),{
    method, redirect:'manual', headers:{accept:'text/html, application/json'},
    signal:AbortSignal.timeout(15000)
  });
  if (response.status >=300 && response.status <400) fail(method+' '+path+' unexpected_redirect');
  assert(response.headers.get('content-length')===null ||
    Number(response.headers.get('content-length'))<=LIMIT, 'oversized_body_header');
  const data=await response.text();
  assert(Buffer.byteLength(data,'utf8')<=LIMIT,'oversized_body');
  return {code:response.status,headers:response.headers,body:data};
}
function noStore(r,label){assert(/no-store/i.test(r.headers.get('cache-control')||''), label+'_cache');}
function browserSecurity(r,label){
  noStore(r,label);
  assert((r.headers.get('content-security-policy')||'').includes("default-src 'none'"), label+'_csp');
  assert((r.headers.get('referrer-policy')||'').toLowerCase()==='no-referrer',label+'_referrer');
}
async function getJson(origin,path,requester){
  const r=await retrieve(origin,path,'GET',requester);
  assert(r.code===200,'HTTP_'+r.code+'_'+path);
  noStore(r,path);
  let value;
  try {value=JSON.parse(r.body);} catch {fail('invalid_json_'+path);}
  assert(value && typeof value==='object' && !Array.isArray(value),'bad_json_'+path);
  return value;
}

export async function inspectV1Public({expectedSha,requester=fetch,
  vanity='https://workspace.robinsonaisystems.com/',
  canonical='https://google-workspace-mcp-chris-projects-de6cd1bf.vercel.app/'}) {
  assert(SHA.test(expectedSha||''),'expected_live_sha_required');
  const hosts=[vanity,canonical];
  for(const host of hosts) allowed(host);
  assert(allowed(vanity).hostname !== allowed(canonical).hostname,'distinct_aliases_required');
  const proofs=[];
  let canonicalIssuer=null;
  for(const base of hosts){
    const contract=await getJson(base,'/api/contract',requester);
    assert(contract.rtc===1,'RTC1_contract_missing');
    assert(contract.deployment?.sourceRevision===expectedSha,'live_deployment_source_mismatch');
    const resource=await getJson(base,'/.well-known/oauth-protected-resource',requester);
    const auth=await getJson(base,'/.well-known/oauth-authorization-server',requester);
    const issuer=allowed(auth.issuer+'/');
    assert(issuer.pathname==='/' && issuer.origin===auth.issuer,'invalid_issuer');
    assert(resource.resource===auth.issuer+'/api/mcp','mcp_resource_mismatch');
    assert(Array.isArray(resource.authorization_servers) &&
      resource.authorization_servers.length===1 &&
      resource.authorization_servers[0]===auth.issuer,'authorization_server_mismatch');
    assert(JSON.stringify(auth.code_challenge_methods_supported)==='["S256"]','PKCE_S256_only_required');
    assert(auth.authorization_endpoint===auth.issuer+'/api/oauth/authorize','authorize_url_mismatch');
    assert(auth.token_endpoint===auth.issuer+'/api/oauth/token','token_url_mismatch');
    assert(auth.registration_endpoint===auth.issuer+'/api/oauth/register','registration_url_mismatch');
    assert(auth.revocation_endpoint===auth.issuer+'/api/oauth/revoke','revocation_url_mismatch');
    assert(Array.isArray(auth.grant_types_supported) &&
      auth.grant_types_supported.includes('refresh_token'),'refresh_grant_missing');
    assert(Array.isArray(auth.revocation_endpoint_auth_methods_supported), 'revocation_auth_missing');
    if(canonicalIssuer!==null)assert(auth.issuer===canonicalIssuer,'aliases_have_different_issuers');
    canonicalIssuer=auth.issuer;
    proofs.push('rtc1-and-oauth-discovery');
  }
  const requirements=[
    ['/', ['Workspace MCP','/api/account','/api/privacy','/api/support','/api/data-deletion']],
    ['/api/privacy',['privacy','Google','retention']],
    ['/api/support',['Robinson AI Systems','support']],
    ['/api/data-deletion',['disconnect','deletion']]
  ];
  for(const [path,needles] of requirements){
    const r=await retrieve(vanity,path,'GET',requester);
    assert(r.code===200,'page_'+path+'_http_'+r.code);
    browserSecurity(r,path);
    assert((r.headers.get('content-type')||'').includes('text/html'),path+'_html');
    for(const required of needles) assert(r.body.toLowerCase().includes(required.toLowerCase()), path+'_missing_public_disclosure');
    const head=await retrieve(vanity,path,'HEAD',requester);
    assert(head.code===200 && head.body==='', 'HEAD_'+path+'_not_bodyless');
    browserSecurity(head,path+'_HEAD');
    proofs.push('public-page-'+path);
  }
  const acct=await retrieve(canonicalIssuer,'/api/account','GET',requester);
  assert(acct.code===401, 'anonymous_portal_not_denied');
  noStore(acct,'anonymous_portal');
  assert((acct.headers.get('x-frame-options')||'').toUpperCase()==='DENY','portal_frame_guard');
  assert((acct.headers.get('referrer-policy')||'').toLowerCase()==='no-referrer','portal_referrer');
  assert(acct.body.includes('Sign in') && !acct.body.includes('Connected Google accounts'),
    'anonymous_portal_improper_disclosure');
  proofs.push('anonymous-portal-401');
  const rev=await retrieve(canonicalIssuer,'/api/oauth/revoke','GET',requester);
  assert(rev.code===405 && (rev.headers.get('allow')||'').includes('POST'),
    'revocation_must_be_post_only');
  noStore(rev,'revoke');
  proofs.push('revocation-method-protection');
  return {ok:true,sourceRevision:expectedSha,proofs,scope:'anonymous HTTP only — no subject, client token or owner refresh proven'};
}

if(process.argv[1] && fileURLToPath(import.meta.url)===process.argv[1]) {
  const i=process.argv.indexOf('--expected-live');
  const sha=i>=0?process.argv[i+1]:undefined;
  try {
    const result=await inspectV1Public({expectedSha:sha});
    console.log('PASS real production anonymous HTTPS source '+result.sourceRevision.slice(0,12)+
      '; checks='+result.proofs.join(', '));
    console.log(result.scope);
  }catch(error) {
    console.error('FAIL read-only v1 public HTTPS check: '+String(error.message).slice(0,170));
    process.exitCode=1;
  }
}
