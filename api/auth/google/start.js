// Public OIDC start never borrows legacy owner OAuth credentials.
import {randomBytes} from 'node:crypto';
import {initSchema,getOAuthClient} from '../../../src/db.js';
import {createTransaction,isLegacyPilotIdentityPrincipal,canLegacyPilotStartFreshConsent,consumeConnectHandle} from '../../../src/principals/store.js';
import {publicGoogleClient,providerUrl,PUBLIC_SCOPE_GROUPS} from '../../../src/principals/google.js';
import {publicMode,publicResource,requireScope,mint,cookie,headers} from '../../../src/principals/security.js';
import {requireSession,requireCsrf,BROWSER_COOKIE} from '../../../src/principals/session.js';
import {redirectCanonicalGet} from '../../../src/principals/canonical-entry.js';
import {redirectAllowed} from '../../../src/oauth/client-compat.js';
export default async function handler(req,res){
 headers(res);
 if(!['GET','POST'].includes(req.method)){res.status(405).json({error:'method_not_allowed'});return;}
 const params=req.method==='POST'?(req.body||{}):(req.query||{});
 try{
  // Google returns to PUBLIC_BASE_URL. Redirect before issuing a host-only
  // browser cookie or storing one-use OAuth state on an alternate hostname.
  if(redirectCanonicalGet(req,res,'/api/auth/google/start',true))return;
  const mode=publicMode();
  const ownerLogin=params.purpose==='owner_login';
  const purpose=params.purpose==='link'?'link':
    ownerLogin||params.purpose==='mcp_authorize'?'mcp_authorize':'login';
  if(mode==='off'&&!ownerLogin&&purpose!=='link'){res.status(503).json({error:'public_signin_disabled'});return;}
  let session=null,connect=null;
  // "Add another Google account" from the Approve page (D-006 MC-7.0): the
  // page's one-use connect handle stands in for the session cookie. It is
  // spent here; the return mints a fresh one for the refreshed page.
  const fromConnect=purpose==='link'&&typeof params.connect==='string'&&params.connect.length>0;
  if(fromConnect){
    requireScope(req.method==='POST','invalid_link_method');
    await initSchema();
    connect=await consumeConnectHandle(params.connect);
    requireScope(connect,'invalid_connect');
  }else if(purpose==='link'){
    requireScope(req.method==='POST','invalid_link_method');
    session=await requireSession(req);
    requireCsrf(req,session,params);
  }else requireScope(req.method==='GET','invalid_start_method');
  // A user's explicit checkbox requests all supported Google scopes in one
  // normal provider consent. An unchecked box cannot upgrade the selected
  // single-service request; this is independent of native agent Full profile.
  // Public connect (and adding an account from its Approve page) asks for
  // everything Google will grant this account in the same one sign-in, the
  // GitHub Unleashed pattern; Google still shows its own consent and decides.
  const publicConnect=purpose==='mcp_authorize'&&!ownerLogin;
  const group=fromConnect||publicConnect?'complete':
    purpose==='link'&&params.godMode==='true'?'complete':
    purpose==='link'?params.group:'identity';
  requireScope(group==='identity'||Object.hasOwn(PUBLIC_SCOPE_GROUPS,group),'invalid_scope_group');
  let clientId=null,redirectUri=null,resource=null,codeChallenge=null,clientState=null;
  if(fromConnect){
    clientId=connect.client_id;redirectUri=connect.redirect_uri;
    resource=connect.resource;codeChallenge=connect.code_challenge;clientState=connect.client_state;
  }
  if(purpose==='mcp_authorize'){
    requireScope(ownerLogin||mode!=='off','public_signin_disabled');
    clientId=params.client_id;redirectUri=params.redirect_uri;
    resource=params.resource;codeChallenge=params.code_challenge;
    const client=await getOAuthClient(clientId);
    requireScope(client&&redirectAllowed(client,redirectUri)
      &&resource===publicResource()+'/api/mcp'
      &&/^[A-Za-z0-9_-]{43}$/.test(codeChallenge),'invalid_mcp_authorization');
  }
  await initSchema();
  const principalId=fromConnect?connect.principal_id:session?.principal_id||null;
  if(purpose==='link'&&await isLegacyPilotIdentityPrincipal(principalId))
   requireScope(await canLegacyPilotStartFreshConsent(principalId),'legacy_pilot_identity_only');
  const client=publicGoogleClient();
  const state=mint('p10st_'),nonce=mint('p10n_'),browser=mint('p10b_');
  const verifier=randomBytes(48).toString('base64url');
  await createTransaction({state,nonce,browser,verifier,purpose,
    principalId,clientId,redirectUri,resource,codeChallenge,
    policy:{group,clientState:purpose==='mcp_authorize'?params.state||null:clientState,
      ...(ownerLogin?{ownerProof:'login'}:{}),
      // Cookie-free legs end on the Approve page; nothing is issued without it.
      ...(publicConnect||fromConnect?{cookieFree:true}:{}),
      ...(fromConnect?{connect:true}:{})}});
  const url=providerUrl({client,state,nonce,verifier,group});
  res.setHeader('Set-Cookie',cookie(BROWSER_COOKIE,browser,'/api/auth/google',600));
  res.writeHead(302,{Location:url});res.end();
 }catch{
  res.status(400).json({error:'invalid_authorization_start'});
 }
}
