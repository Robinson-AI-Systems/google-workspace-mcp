// Public OIDC start never borrows legacy owner OAuth credentials.
import {randomBytes} from 'node:crypto';
import {initSchema,getOAuthClient} from '../../../src/db.js';
import {createTransaction} from '../../../src/principals/store.js';
import {publicGoogleClient,providerUrl,PUBLIC_SCOPE_GROUPS} from '../../../src/principals/google.js';
import {publicMode,publicResource,requireScope,mint,cookie,headers} from '../../../src/principals/security.js';
import {requireSession,requireCsrf,BROWSER_COOKIE} from '../../../src/principals/session.js';
export default async function handler(req,res){
 headers(res);
 if(!['GET','POST'].includes(req.method)){res.status(405).json({error:'method_not_allowed'});return;}
 const params=req.method==='POST'?(req.body||{}):(req.query||{});
 try{
  const mode=publicMode();
  const ownerLogin=params.purpose==='owner_login';
  const purpose=params.purpose==='link'?'link':
    ownerLogin||params.purpose==='mcp_authorize'?'mcp_authorize':'login';
  if(mode==='off'&&!ownerLogin&&purpose!=='link'){res.status(503).json({error:'public_signin_disabled'});return;}
  let session=null;
  if(purpose==='link'){
    requireScope(req.method==='POST','invalid_link_method');
    session=await requireSession(req);
    requireCsrf(req,session,params);
  }else requireScope(req.method==='GET','invalid_start_method');
  const group=purpose==='link'?params.group:'identity';
  requireScope(group==='identity'||Object.hasOwn(PUBLIC_SCOPE_GROUPS,group),'invalid_scope_group');
  let clientId=null,redirectUri=null,resource=null,codeChallenge=null;
  if(purpose==='mcp_authorize'){
    requireScope(ownerLogin||mode!=='off','public_signin_disabled');
    clientId=params.client_id;redirectUri=params.redirect_uri;
    resource=params.resource;codeChallenge=params.code_challenge;
    const client=await getOAuthClient(clientId);
    requireScope(client&&client.redirect_uris.includes(redirectUri)
      &&resource===publicResource()+'/api/mcp'
      &&/^[A-Za-z0-9_-]{43}$/.test(codeChallenge),'invalid_mcp_authorization');
  }
  await initSchema();
  const client=publicGoogleClient();
  const state=mint('p10st_'),nonce=mint('p10n_'),browser=mint('p10b_');
  const verifier=randomBytes(48).toString('base64url');
  await createTransaction({state,nonce,browser,verifier,purpose,
    principalId:session?.principal_id||null,clientId,redirectUri,resource,codeChallenge,
    policy:{group,clientState:purpose==='mcp_authorize'?params.state||null:null,
      ...(ownerLogin?{ownerProof:'login'}:{})}});
  const url=providerUrl({client,state,nonce,verifier,group});
  res.setHeader('Set-Cookie',cookie(BROWSER_COOKIE,browser,'/api/auth/google',600));
  res.writeHead(302,{Location:url});res.end();
 }catch{
  res.status(400).json({error:'invalid_authorization_start'});
 }
}
