import {initSchema} from '../../../src/db.js';
import {consumeTransaction,bindVerifiedIdentity,upsertLinkedAccount} from '../../../src/principals/store.js';
import {publicGoogleClient,verifyGoogleCode,PUBLIC_SCOPE_GROUPS} from '../../../src/principals/google.js';
import {admitted,digest,cookie,headers,requireScope} from '../../../src/principals/security.js';
import {readCookie,publicResource} from '../../../src/principals/security.js';
import {setSession,requireSession,BROWSER_COOKIE} from '../../../src/principals/session.js';
export default async function handler(req,res){
 headers(res);
 if(req.method!=='GET'){res.status(405).send('Method not allowed');return;}
 const browser=readCookie(req,BROWSER_COOKIE),state=req.query?.state;
 res.setHeader('Set-Cookie',cookie(BROWSER_COOKIE,'','/api/auth/google',0));
 if(typeof state!=='string'||!browser){res.status(400).send('Invalid Google sign-in.');return;}
 try{
  await initSchema();
  let tx=null;
  for(const purpose of ['login','link','mcp_authorize']){
    tx=await consumeTransaction({state,browser,purpose});
    if(tx)break;
  }
  requireScope(tx,'invalid_state');
  if(req.query?.error || typeof req.query?.code!=='string' || !req.query.code)
    throw Error('consent_declined');
  // Google SDK verifies signature/audience/expiry; compare nonce hash, never
  // accept unverified email/hd/client hints from request parameters.
  const verified=await verifyGoogleCode({client:publicGoogleClient(),code:req.query.code,
    verifier:tx.verifier,nonceHash:tx.nonce_hash});
  let principalId;
  if(tx.purpose==='link'){
    const session=await requireSession(req);
    requireScope(session.principal_id===tx.principal_id,'principal_mismatch');
    const scopes=tx.policy?.group&&PUBLIC_SCOPE_GROUPS[tx.policy.group];
    requireScope(scopes?.every(scope=>verified.scopeList.includes(scope)),'grant_scope_missing');
    await upsertLinkedAccount({principalId:session.principal_id,issuer:verified.issuer,
      sub:verified.sub,verifiedEmail:verified.email,scopeList:verified.scopeList,tokens:verified.tokens});
    principalId=session.principal_id;
  }else {
    requireScope(admitted(verified.sub),'public_signin_not_admitted');
    principalId=await bindVerifiedIdentity({issuer:verified.issuer,sub:verified.sub,
      verifiedEmail:verified.email});
    await setSession(res,principalId);
  }
  // Only protocol/client metadata (never Google token or service credentials)
  // may be returned in an OAuth resume location.
  if(tx.purpose==='mcp_authorize'){
    const next=new URL('/api/oauth/authorize',process.env.PUBLIC_BASE_URL);
    next.searchParams.set('client_id',tx.client_id);
    next.searchParams.set('redirect_uri',tx.redirect_uri);
    next.searchParams.set('code_challenge',tx.code_challenge);
    next.searchParams.set('code_challenge_method','S256');
    next.searchParams.set('resource',tx.resource);
    next.searchParams.set('auth_method','google');
    res.writeHead(302,{Location:next.toString()});res.end();return;
  }
  res.writeHead(302,{Location:'/api/account'});res.end();
 }catch{
  // A consumed state may not be retried. Never expose provider tokens/errors.
  res.status(400).send('Sign-in or account-link verification failed; restart the protected flow.');
 }
}
