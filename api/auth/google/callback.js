import {initSchema} from '../../../src/db.js';
import {consumeTransaction,bindVerifiedIdentity,upsertLinkedAccount} from '../../../src/principals/store.js';
import {publicGoogleClient,verifyGoogleCode,PUBLIC_SCOPE_GROUPS} from '../../../src/principals/google.js';
import {admitted,digest,cookie,headers,requireScope} from '../../../src/principals/security.js';
import {readCookie} from '../../../src/principals/security.js';
import {setSession,requireSession,BROWSER_COOKIE} from '../../../src/principals/session.js';
import {linkVerifiedOwner,issueOwnerLoginProof} from '../../../src/principals/owner-migration.js';
// Audit only fixed callback phases and approved denial codes. Never log provider
// exception messages: Google SDK errors may carry a code, account or token.
const SAFE_DENIAL_CODES=new Set([
 'invalid_state','consent_declined','invalid_verified_identity','identity_token_missing',
 'public_signin_not_admitted','reserved_identity','invalid_identity',
 'invalid_owner_link','invalid_owner_login','invalid_pilot_subject_proof',
 'principal_mismatch','grant_scope_missing','identity_owned_elsewhere',
 'session_required','invalid_grant','version_conflict','outside_scope'
]);
export default async function handler(req,res){
 headers(res);
 if(req.method!=='GET'){res.status(405).send('Method not allowed');return;}
 const browser=readCookie(req,BROWSER_COOKIE),state=req.query?.state;
 res.setHeader('Set-Cookie',cookie(BROWSER_COOKIE,'','/api/auth/google',0));
 if(typeof state!=='string'||!browser){res.status(400).send('Invalid Google sign-in.');return;}
 let phase='schema';
 try{
  await initSchema();
  phase='transaction';
  let tx=null;
  for(const purpose of ['login','link','mcp_authorize']){
    tx=await consumeTransaction({state,browser,purpose});
    if(tx)break;
  }
  requireScope(tx,'invalid_state');
  phase='provider_verification';
  if(req.query?.error || typeof req.query?.code!=='string' || !req.query.code)
    throw Error('consent_declined');
  // Google SDK verifies signature/audience/expiry; compare nonce hash, never
  // accept unverified email/hd/client hints from request parameters.
  const verified=await verifyGoogleCode({client:publicGoogleClient(),code:req.query.code,
    verifier:tx.verifier,nonceHash:tx.nonce_hash});
  // Owner-passphrase authenticated identity discovery for a disposable pilot
  // tester: use a one-use, browser-bound OIDC transaction while normal public
  // enrollment is OFF. Reveal only the stable verified subject to that browser.
  // Never mint a principal, store grants, expose a Google token or enable tools.
  if(tx.policy?.pilotProbe===true){
    phase='identity_probe';
    requireScope(tx.purpose==='login'&&!tx.principal_id&&!tx.policy?.ownerProof,
      'invalid_pilot_subject_proof');
    const safe=x=>String(x).replace(/[&<>"']/g,c=>({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
    }[c]));
    res.setHeader('Content-Type','text/html; charset=utf-8');
    res.setHeader('Content-Security-Policy',
      "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    res.status(200).send('<!doctype html><meta charset="utf-8">'+
      '<title>Verified pilot subject</title>'+
      '<main style="font:16px/1.5 system-ui;max-width:42rem;margin:3rem auto">'+
      '<h1>Google-verified tester identity (no enrollment)</h1>'+
      '<p>Verify you used the intended disposable Google tester. This identifier is not a Google access token.</p>'+
      '<p>Verified account: '+safe(verified.email)+'</p>'+
      '<p>Google subject ID to configure privately: <code>'+safe(verified.sub)+'</code></p>'+
      '<p>Put the subject ID in PUBLIC_PILOT_GOOGLE_SUBJECTS through the protected deployment settings. '+
      'Do not paste it into chat, source control or issue comments. Pilot mode remains OFF until separately approved.</p>'+
      '</main>');return;
  }
  // The owner recovery path is never a public principal enrollment or
  // a new Google mailbox grant. Its passphrase-protected, one-use transaction
  // authorizes linking; later login requires the linked verified issuer/sub.
  if(tx.policy?.ownerProof==='link'){
    phase='owner_link';
    requireScope(tx.purpose==='login'&&!tx.principal_id,'invalid_owner_link');
    await linkVerifiedOwner({issuer:verified.issuer,sub:verified.sub,email:verified.email});
    res.writeHead(302,{Location:'/api/owner/migration?linked=1'});res.end();return;
  }
  if(tx.policy?.ownerProof==='login'){
    phase='owner_login';
    requireScope(tx.purpose==='mcp_authorize'&&!tx.principal_id,'invalid_owner_login');
    const meta={clientId:tx.client_id,redirectUri:tx.redirect_uri,
      resource:tx.resource,codeChallenge:tx.code_challenge,
      clientState:tx.policy?.clientState||''};
    const proof=await issueOwnerLoginProof(verified,meta);
    res.setHeader('Set-Cookie',[
      cookie(BROWSER_COOKIE,'','/api/auth/google',0),
      cookie('p10_owner_proof',proof,'/api/oauth/authorize',300)
    ]);
    const next=new URL('/api/oauth/authorize',process.env.PUBLIC_BASE_URL);
    next.searchParams.set('client_id',meta.clientId);
    next.searchParams.set('redirect_uri',meta.redirectUri);
    next.searchParams.set('code_challenge',meta.codeChallenge);
    next.searchParams.set('code_challenge_method','S256');
    next.searchParams.set('resource',meta.resource);
    next.searchParams.set('auth_method','owner_google');
    if(meta.clientState)next.searchParams.set('state',meta.clientState);
    res.writeHead(302,{Location:next.toString()});res.end();return;
  }
  let principalId;
  if(tx.purpose==='link'){
    phase='account_link';
    const session=await requireSession(req);
    requireScope(session.principal_id===tx.principal_id,'principal_mismatch');
    const scopes=tx.policy?.group&&PUBLIC_SCOPE_GROUPS[tx.policy.group];
    requireScope(scopes?.every(scope=>verified.scopeList.includes(scope)),'grant_scope_missing');
    await upsertLinkedAccount({principalId:session.principal_id,issuer:verified.issuer,
      sub:verified.sub,verifiedEmail:verified.email,scopeList:verified.scopeList,tokens:verified.tokens});
    principalId=session.principal_id;
  }else {
    phase='pilot_admission';
    requireScope(admitted(verified.sub),'public_signin_not_admitted');
    phase='principal_bind';
    principalId=await bindVerifiedIdentity({issuer:verified.issuer,sub:verified.sub,
      verifiedEmail:verified.email});
    phase='session_creation';
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
    if(tx.policy?.clientState)next.searchParams.set('state',tx.policy.clientState);
    res.writeHead(302,{Location:next.toString()});res.end();return;
  }
  res.writeHead(302,{Location:'/api/account'});res.end();
 }catch(error){
  // These fixed, low-cardinality fields enable triage without identifiers.
  // Deliberately do not serialize an SDK/SQL error, request or user identity.
  const message=typeof error?.message==='string'?error.message:null;
  const code=SAFE_DENIAL_CODES.has(message)?message:'unclassified';
  console.warn('p10_google_callback_denied',{phase,code});
  // A consumed state may not be retried; never expose the internal reason.
  res.status(400).send('Sign-in or account-link verification failed; restart the protected flow.');
 }
}
