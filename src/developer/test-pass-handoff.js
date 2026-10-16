// Attach an EXISTING TEST credential to one RSA-key-owning runner. This cannot
// issue, renew, widen or revoke a pass. Only ciphertext enters the handoff store.
import {createHash, randomBytes, publicEncrypt, constants} from 'node:crypto';
import {validateStart} from './handoff.js';
import {MAX_FAILED_LOGINS, LOCKOUT_WINDOW_MINUTES} from '../oauth/login-guard.js';
const digest = v => createHash('sha256').update(v).digest('hex');
const statePattern = /^[A-Za-z0-9_-]{43}$/;
const passIdPattern = /^pass_[a-f0-9]{20}$/;
const escape = v => String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const prefix = 'rtc-pass:';
export const testPassPath = '/api/developer/test-pass';

export function createTestPassHandoff({store, origin, getClient, getPass, loginStore, clientIp, now=()=>Date.now()}) {
  if(new URL(origin).origin!==origin || !origin.startsWith('https://')) throw Error('invalid_origin');
  return async (req,res) => {
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'none'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");
    const json=(status,value)=>res.status(status).json(value);
    const page=(status,body)=>res.status(status).send('<!doctype html><meta charset="utf-8"><title>Connect existing TEST pass</title><main>'+body+'</main>');
    try {
      if(!['GET','POST'].includes(req.method)) {res.setHeader('Allow','GET, POST');return json(405,{error:'method_not_allowed'});}
      if(req.method==='POST' && (req.headers['content-type']||'').split(';')[0]==='application/json') {
        const p=req.body;
        if(!p || typeof p!=='object' || Array.isArray(p) || Object.keys(p).some(k=>!['client_id','poll_hash','public_key','pass_id'].includes(k)) || !passIdPattern.test(p.pass_id||''))return json(400,{error:'invalid_request'});
        let valid;try {valid=validateStart({client_id:p.client_id,poll_hash:p.poll_hash,public_key:p.public_key,challenge:'a'.repeat(43),profile:'read_only'});}catch{return json(400,{error:'invalid_request'});}
        const client=await getClient(p.client_id);
        if(!client?.redirect_uris?.includes(origin+'/api/developer/connect'))return json(400,{error:'invalid_client'});
        const state=randomBytes(32).toString('base64url'),expires=new Date(now()+600000);
        if(!await store.start({...valid,client_id:prefix+p.client_id,challenge:p.pass_id,state,ip:digest(String(clientIp(req))),expires}))return json(429,{error:'request_unavailable'});
        return json(201,{request_id:state,authorization_url:origin+testPassPath+'?state='+state,expires_at:expires.toISOString()});
      }
      const p=req.method==='GET'?req.query:req.body;
      if(!p || !statePattern.test(p.state||'') || Object.keys(p).some(k=>!['state',...(req.method==='POST'?['token']:[])].includes(k)))return json(400,{error:'invalid_request'});
      const row=await store.find(p.state);
      if(!row || !row.client_id.startsWith(prefix) || !passIdPattern.test(row.challenge||'') || !(new Date(row.expires_at).getTime()>now()))return json(410,{error:'request_unavailable'});
      if(req.method==='GET' && req.headers.authorization!==undefined) {
        const secret=/^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization)?.[1];
        if(!secret)return json(401,{error:'unauthorized'});
        const result=await store.poll(p.state,digest(secret));
        if(!result)return json(410,{error:'request_unavailable'});
        if(result.status==='pending')return json(202,{status:'authorization_pending'});
        if(result.status!=='authorized')return json(403,{error:'access_denied'});
        // Revalidate revocation/expiry in the runner immediately after decryption.
        return json(200,{status:'authorized',sealed_pass:result.sealed_code});
      }
      if(req.method==='GET') {
        if(req.headers.host!==new URL(origin).host){res.writeHead(303,{Location:origin+testPassPath+'?state='+p.state});return res.end();}
        res.setHeader('Referrer-Policy','same-origin');
        return page(200,'<h1>Sign in with your existing TEST pass</h1><p>This connects the pass to the requesting test runner. It does not create a pass or change its permissions or expiry. Use only a request your agent prepared.</p><p>Expected pass identifier: <code>'+escape(row.challenge)+'</code></p><form method="POST"><input type="hidden" name="state" value="'+escape(p.state)+'"><label>Existing TEST pass <input type="password" name="token" autocomplete="off" required></label><button type="submit">Connect existing pass</button></form>');
      }
      if(req.headers.origin!==origin)return json(403,{error:'origin_refused'});
      if((req.headers['content-type']||'').split(';')[0]!=='application/x-www-form-urlencoded')return json(415,{error:'invalid_content_type'});
      const attempt=await loginStore.recordLoginAttempt(clientIp(req));
      if(await loginStore.countRecentFailedLogins(clientIp(req),LOCKOUT_WINDOW_MINUTES)>MAX_FAILED_LOGINS)return json(429,{error:'rate_limited'});
      if(typeof p.token!=='string'||!/^rtc_pass_[A-Za-z0-9_-]{43}$/.test(p.token))return json(401,{error:'invalid_test_pass'});
      const pass=await getPass(p.token);
      if(!pass || pass.id!==row.challenge || pass.mode!=='test' || !(new Date(pass.expires_at).getTime()>now()))return json(401,{error:'invalid_test_pass'});
      await loginStore.markLoginAttemptSucceeded(attempt);
      const sealed=publicEncrypt({key:row.public_key,oaepHash:'sha256',padding:constants.RSA_PKCS1_OAEP_PADDING},Buffer.from(p.token)).toString('base64url');
      if(!await store.approve(p.state,sealed))return json(409,{error:'request_already_handled'});
      return page(200,'<h1>TEST pass connected</h1><p>The original test runner can retrieve its encrypted credential. Permissions and expiry are unchanged. Return to your chat; there is no token to copy.</p>');
    } catch {return json(503,{error:'test_connection_unavailable'});}
  };
}
