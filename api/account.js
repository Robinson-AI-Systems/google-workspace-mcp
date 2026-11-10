// User-owned account portal. No global owner mailbox/connection listing.
import {initSchema,getOAuthClient} from '../src/db.js';
import {listAccounts,listConnections,revokeConnection,disconnectAccount,deletionPreview,
  setPrincipalDefault,requestDeletion,cancelDeletion,isLegacyPilotIdentityPrincipal,
  canLegacyPilotStartFreshConsent,getLinkedGrant,getLatestLinkDenial,
  getSigninDenial,deleteSigninDenial,setConnectionProfile,setWritesPaused,getWritesPaused} from '../src/principals/store.js';
import {brandPage,BRAND_CSP} from '../src/brand/brand.js';
import {ACCESS_LEVELS} from '../src/brand/access-levels.js';
import {requireSession,requireCsrf,CSRF_COOKIE} from '../src/principals/session.js';
import {configureCustomerDelegation,listCustomerDelegations,revokeCustomerDelegation,
  addVerifiedDelegationSubject,removeDelegationSubject} from '../src/principals/delegation.js';
import {readCookie,headers,requireScope} from '../src/principals/security.js';
import {PUBLIC_SCOPE_GROUPS,publicGoogleClient} from '../src/principals/google.js';
import {redirectCanonicalGet} from '../src/principals/canonical-entry.js';
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function handler(req,res){
 headers(res);
 if(!['GET','POST'].includes(req.method))return res.status(405).send('Method not allowed');
 try{
   // The public alias and configured OAuth callback must share the same host.
   // A GET is safe to redirect; POST mutations must remain CSRF-bound.
   if(redirectCanonicalGet(req,res,'/api/account'))return;
   await initSchema();
   let session;
   try{session=await requireSession(req);}
   catch(error){
     if(req.method!=='GET'||error?.message!=='session_required')throw error;
     // A refused sign-in redirects here carrying a one-time denial id: show
     // the exact fixed-vocabulary reason instead of a bare failure page.
     let signinNote='';
     const denialId=typeof req.query?.d==='string'?req.query.d:null;
     if(denialId){
       const signinDenial=await getSigninDenial(denialId).catch(()=>null);
       if(signinDenial){
         deleteSigninDenial(denialId).catch(()=>{});
         const signinLabels={
           public_signin_not_admitted:'New sign-ups are switched off on this server right now.',
           bound_issuer_form_mismatch:'Your account is on record under an older form of Google\u2019s sign-in.',
           bound_not_user_principal:'That Google account is set up for a different kind of access here.',
           bound_principal_inactive:'The account on record for that Google sign-in is not active.',
           bound_shell_no_fresh_grant:'Your account is on record, but it never finished its first permission step.',
           bound_shell_email_mismatch:'Your account is on record, but the email Google returned does not match it.',
           account_without_identity_binding:'That Google account is connected, but cannot be used to sign in.',
           bound_not_admissible:'That account is on record, but cannot sign in as it stands.',
           reserved_identity:'That Google account is held by this server\u2019s original connection.',
           invalid_state:'That sign-in expired or was already used. Start again.',
           consent_declined:'The Google sign-in was cancelled.',
           invalid_verified_identity:'Google could not confirm that sign-in.',
           invalid_identity:'Google could not confirm that sign-in.',
           invalid_grant:'Google refused the sign-in code. Start again.'};
         signinNote='<p class="error" role="alert"><strong>That sign-in did not go through.</strong> '+
           escape(signinLabels[signinDenial.code]||'Google could not confirm it.')+'</p>'+
           '<p class="hint">For support: refused at the '+escape(signinDenial.phase)+' step. Reason code: '+
           escape(signinDenial.code)+', '+escape(new Date(signinDenial.created_at).toISOString())+'.</p>';
       }
     }
     res.setHeader('Content-Type','text/html; charset=utf-8');
     res.setHeader('Content-Security-Policy',BRAND_CSP);
     return res.status(401).send(brandPage('Sign in','<h1>My Workspace connections</h1>'+signinNote+
       '<p>Sign in to see the Google accounts and AI apps you have connected, change what each app may do, '+
       'add another Google account, disconnect anything, or remove your data.</p>'+
       '<p><a class="button" href="/api/auth/google/start?purpose=login">Sign in with Google</a></p>'+
       '<p class="hint">Use any Google account you control. You never type a password here; Google handles the sign-in.</p>'));
   }
   const principalId=session.principal_id;
   const identityOnly=await isLegacyPilotIdentityPrincipal(principalId);
   const freshConsentAvailable=identityOnly&&await canLegacyPilotStartFreshConsent(principalId);
   if(req.method==='POST'){
     if(identityOnly)return res.status(403).json({error:'legacy_pilot_identity_only'});
     const body=req.body&&typeof req.body==='object'?req.body:{};
     requireCsrf(req,session,body);
     const action=body.action;
     let status,result;
     try{[status,result]=await runAction(principalId,body);}
     catch(error){if(body.return!=='page')throw error;status=400;result=null;}
     // Buttons on the page send return=page: answer with a page, not raw JSON.
     if(body.return==='page'){
       res.setHeader('Content-Security-Policy',BRAND_CSP);
       return sendActionPage(res,status,result,action);
     }
     return res.status(status).json(result);
   }
   const csrf=readCookie(req,CSRF_COOKIE)||'';
   if(!csrf)return res.status(401).send('Session CSRF state missing.');
   res.setHeader('Content-Type','text/html; charset=utf-8');
   res.setHeader('Content-Security-Policy',BRAND_CSP);
   return res.status(200).send(await renderPortal({principalId,csrf,identityOnly,freshConsentAvailable,
     notice:typeof req.query?.notice==='string'?req.query.notice:null}));
 }catch{return res.status(403).json({error:'invalid_session_or_scope'});}
}

const reply=(status,result)=>[status,result];
async function runAction(principalId,body){
 const action=body.action;
     if(action==='set_profile'){
   return reply(200,{profile:await setConnectionProfile(principalId,body.id,body.profile)});
 }
 if(action==='pause_writes'||action==='resume_writes'){
   return reply(200,{writesPaused:await setWritesPaused(principalId,action==='pause_writes')});
 }
 if(action==='revoke_connection'){
   return reply(200,{revoked:await revokeConnection(principalId,body.id)});
 }
 if(action==='disconnect_account'){
   return reply(200,{disconnected:await disconnectAccount(principalId,body.id),
     note:'Local account and agent connections disabled. Google provider revocation not claimed.'});
 }
 if(action==='disable_god_mode'){
   requireScope(body.confirm===true||body.confirm==='true','owner_confirmation_required');
   const owned=(await listAccounts(principalId)).find(a=>a.id===body.id);
   requireScope(owned&&PUBLIC_SCOPE_GROUPS.complete.every(scope=>owned.scope_list.includes(scope)),
     'god_mode_not_enabled');
   // Best-effort provider-side revocation is never equated with local
   // account revocation. This is this principal's own independent Google
   // grant from the PUBLIC OAuth client, never the legacy owner client.
   // The local stop must work even when Google is temporarily unreachable.
   // Stop local account/client dispatch before any external provider
   // network request. A slow/failing Google revocation cannot leave the
   // owner's native agent access active while the request waits.
   let token=null;
   try {
     const grant=await getLinkedGrant(principalId,body.id);
     token=grant?.refresh_token||grant?.access_token||null;
   }catch{ /* local revocation still proceeds */ }
   const disconnected=await disconnectAccount(principalId,body.id);
   let providerRevoked=false;
   if(disconnected>0&&token){
     try {
       await publicGoogleClient().revokeToken(token);
       providerRevoked=true;
     }catch{ /* Google revocation is unverified: report precisely */ }
   }
   return reply(200,{godMode:false,disconnected,
     agentConnectionsRevoked:disconnected>0,providerRevoked,
     note:providerRevoked
       ?'Google app permission revocation was confirmed. This account and its agents are also disabled locally. To resume, authorize only the services you choose and reconnect your agent.'
       :'Account and agent access are stopped locally. Google provider-wide authorization could not be confirmed revoked. Review your Google Account third-party access settings to revoke this app at Google, then reauthorize only the services you choose.'});
 }
 if(action==='set_default'){
   return reply(200,{defaultAccountId:await setPrincipalDefault(principalId,body.id)});
 }
 if(action==='setup_delegation'){
   if(body.confirm!==true&&body.confirm!=='true')return reply(400,{error:'owner_confirmation_required'});
   const scopes=Array.isArray(body.scopes)?body.scopes:String(body.scopes||'').split(/[\s,]+/).filter(Boolean);
   const receipt=await configureCustomerDelegation({principalId,accountId:body.id,
     credentialJson:body.credential,scopes});
   return reply(200,receipt);
 }
 if(action==='revoke_delegation')return reply(200,await revokeCustomerDelegation(principalId,body.id,body.customerId));
 if(action==='verify_delegated_subject')return reply(200,await addVerifiedDelegationSubject(principalId,body.id,body.customerId,body.subject));
 if(action==='remove_delegated_subject')return reply(200,await removeDelegationSubject(principalId,body.id,body.customerId,body.subject));
 if(action==='delete_preview')return reply(200,await deletionPreview(principalId));
 if(action==='request_delete')return reply(200,await requestDeletion(principalId));
 if(action==='cancel_delete')return reply(200,await cancelDeletion(principalId));
 return reply(400,{error:'unknown_action'});
}

// ---- BRAND-1 / CONTROLS-1 (2026-11-09): the page people actually see.
// Plain words, one consequence sentence per control, nothing internal.

const SERVICE_NAMES={mail:'Gmail',files:'Drive, Docs, Sheets, Slides and Forms',calendar:'Calendar',tasks:'Tasks',
 contacts:'Contacts',chat:'Chat',classroom:'Classroom',adminVerify:'Admin check',
 adminDirectory:'Admin: users, groups and security',reports:'Admin reports',groups:'Group settings',
 licensing:'Licensing',dataTransfer:'Data transfer',cloudIdentity:'Organisation policies',
 chromePolicy:'Chrome policies',vault:'Vault',siteVerification:'Site verification',postmaster:'Email delivery statistics'};
export function servicesInWords(scopeList=[]){
 return Object.entries(PUBLIC_SCOPE_GROUPS).filter(([group])=>group!=='complete')
  .filter(([,scopes])=>scopes.some(scope=>scopeList.includes(scope)))
  .map(([group])=>SERVICE_NAMES[group]||group);
}
const NOTICES={
 set_profile:'Saved. The new access level applies from the app’s next request.',
 pause_writes:'All your apps are now read-only. They can still look, but nothing can be changed until you turn changes back on.',
 resume_writes:'Your apps can make changes again, each at its own access level.',
 revoke_connection:'That app is disconnected. Remove the connector in the app too if you no longer want it listed there.',
 disconnect_account:'That Google account is disconnected here, together with the apps connected through it.',
 disable_god_mode:'All permissions are turned off for that account, and its apps are disconnected.',
 set_default:'Default account updated.',
 setup_delegation:'Organisation access is saved.',
 revoke_delegation:'Organisation access is turned off.',
 verify_delegated_subject:'Mailbox added.',
 remove_delegated_subject:'Mailbox removed.',
 request_delete:'Your deletion request is in. You can cancel it on this page.',
 cancel_delete:'Your deletion request is cancelled.'
};
export function sendActionPage(res,status,result,action){
 res.setHeader('Content-Type','text/html; charset=utf-8');
 if(status>=400)return res.status(status).send(brandPage('Not done','<h1>That was not done</h1>'+
  '<p>Nothing was changed. Go back and try again.</p><p><a class="button" href="/api/account">Back to My Workspace connections</a></p>'));
 if(action==='delete_preview'){
  const rows=Object.entries(result||{}).filter(([,v])=>typeof v==='number'||typeof v==='boolean'||typeof v==='string');
  return res.status(200).send(brandPage('What is stored','<h1>What is stored for you</h1>'+
   '<p>This is only a preview. Nothing has been removed.</p><ul>'+
   rows.map(([k,v])=>'<li>'+escape(k.replace(/_/g,' '))+': '+escape(String(v))+'</li>').join('')+'</ul>'+
   '<p><a class="button" href="/api/account">Back to My Workspace connections</a></p>'));
 }
 if(action==='disable_god_mode'&&result&&result.providerRevoked===false){
  res.writeHead(303,{Location:'/api/account?notice=disable_god_mode_unconfirmed'});return res.end();
 }
 res.writeHead(303,{Location:'/api/account?notice='+encodeURIComponent(NOTICES[action]?action:'done')});return res.end();
}
const appName=async clientId=>{
 if(clientId==='muse'||/muse-client\.json$/.test(String(clientId)))return 'Muse';
 try{const c=await getOAuthClient(clientId);if(c?.client_name)return c.client_name;}catch{}
 return 'App '+String(clientId).slice(0,10);
};
export async function renderPortal({principalId,csrf,identityOnly,freshConsentAvailable,notice}){
 const [accounts,allConnections,delegations,linkDenial,writesPaused]=await Promise.all([
  listAccounts(principalId),listConnections(principalId),listCustomerDelegations(principalId),
  getLatestLinkDenial(principalId).catch(()=>null),getWritesPaused(principalId).catch(()=>false)]);
 const now=Date.now();
 const connections=allConnections.filter(c=>!c.revoked_at&&(!c.expires_at||new Date(c.expires_at).getTime()>now));
 const emailOf=id=>accounts.find(a=>a.id===id)?.email||'a disconnected account';
 const hidden=(action,id='')=>'<input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
  '<input type="hidden" name="return" value="page"><input type="hidden" name="action" value="'+escape(action)+'">'+
  (id?'<input type="hidden" name="id" value="'+escape(id)+'">':'');
 const button=(action,id,label,cls='secondary small')=>'<form method="POST" class="inline">'+hidden(action,id)+
  '<button class="'+cls+'">'+escape(label)+'</button></form>';
 const complete=PUBLIC_SCOPE_GROUPS.complete;
 const notices={...NOTICES,disable_god_mode_unconfirmed:'All permissions are turned off here and the apps are disconnected, but Google did not confirm it. To be sure, remove Workspace Unleashed from your Google Account’s third-party access page.',done:'Done.'};
 const banner=notice&&notices[notice]?'<p class="card" role="status">'+escape(notices[notice])+'</p>':'';
 const denialWords={grant_scope_missing:'Google did not grant any of the permissions asked for.',
  legacy_pilot_identity_only:'This sign-in is a test identity that cannot add accounts.',
  identity_owned_elsewhere:'That Google account is already connected to a different person here.',
  reserved_identity:'That Google account is held by this server’s original connection.',
  session_required:'You were signed out part-way. Sign in and try again.',
  principal_mismatch:'You were signed out part-way. Sign in and try again.',
  consent_declined:'The Google sign-in was cancelled.',invalid_link:'The request was incomplete. Try again.'};
 const denialNote=linkDenial?'<p class="error">Your last attempt to add a Google account did not go through: '+
  escape(denialWords[linkDenial.code]||'Google could not confirm it.')+
  ' <span class="hint">(Reason code '+escape(linkDenial.code)+', '+escape(new Date(linkDenial.created_at).toISOString())+')</span></p>':'';

 // Apps
 const appCards=await Promise.all(connections.map(async c=>{
  const name=await appName(c.client_id);
  const level=ACCESS_LEVELS.find(l=>l.id===c.profile)||ACCESS_LEVELS[2];
  const tag=writesPaused?'<span class="tag warn">changes paused</span>':
   c.profile==='read_only'?'<span class="tag">read-only</span>':'<span class="tag good">can make changes</span>';
  return '<div class="card"><div class="row"><b>'+escape(name)+'</b>'+tag+'</div>'+
   '<p class="hint">Uses '+escape(emailOf(c.account_id))+' unless told otherwise. Access level: '+escape(level.label)+'.</p>'+
   '<details><summary>Change what '+escape(name)+' may do</summary><form method="POST">'+hidden('set_profile',c.id)+
   ACCESS_LEVELS.map(l=>'<label class="choice"><input type="radio" name="profile" value="'+l.id+'"'+(l.id===c.profile?' checked':'')+'>'+
    '<div><b>'+escape(l.label)+'</b><span>'+escape(l.says)+'</span></div></label>').join('')+
   '<button>Save</button></form></details>'+button('revoke_connection',c.id,'Disconnect this app')+'</div>';
 }));
 const pause='<form method="POST">'+hidden(writesPaused?'resume_writes':'pause_writes')+
  (writesPaused?'<p><b>All your apps are read-only right now.</b> They can look but cannot change anything.</p><button>Let my apps make changes again</button>'
   :'<p>Need a pause? One tap stops every app from changing anything, until you turn it back.</p><button class="secondary">Make all my apps read-only</button>')+'</form>';
 const appsSection='<section><h2>Your AI apps</h2>'+(connections.length?pause+appCards.join(''):
  '<p>No AI app is connected yet. Add Workspace Unleashed as a connector in your AI app; the <a href="/#connect">home page</a> shows how.</p>')+'</section>';

 // Google accounts
 const accountCards=accounts.map(a=>{
  const services=servicesInWords(a.scope_list);
  const granted=complete.filter(scope=>a.scope_list.includes(scope)).length;
  const all=granted===complete.length;
  return '<div class="card"><div class="row"><b>'+escape(a.label||a.email)+'</b>'+(a.is_default?'<span class="tag good">default</span>':'')+
   (all?'<span class="tag warn">all permissions</span>':'')+'</div>'+
   (a.label?'<p class="hint">'+escape(a.email)+'</p>':'')+
   '<p class="hint">'+(services.length?'Connected: '+escape(services.join(', '))+'.':'Signed in, but no Google services are connected yet.')+
   (!all&&granted>0?' Google did not grant everything this service supports for this account (for example, admin permissions need a Google Workspace administrator).':'')+'</p>'+
   '<div class="row">'+(a.is_default?'':button('set_default',a.id,'Make default'))+button('disconnect_account',a.id,'Disconnect')+'</div>'+
   (all?'<details><summary>Turn off all permissions</summary><form method="POST">'+hidden('disable_god_mode',a.id)+
    '<p>This asks Google to withdraw everything this service was allowed for '+escape(a.email)+', disconnects it here, and disconnects its apps. You can connect it again later.</p>'+
    '<label class="choice"><input type="checkbox" name="confirm" value="true" required><div><b>I understand</b></div></label>'+
    '<button>Turn off all permissions</button></form></details>':'')+'</div>';
 }).join('');
 const services=Object.keys(PUBLIC_SCOPE_GROUPS).filter(group=>group!=='complete');
 const addForm=identityOnly&&!freshConsentAvailable
  ?'<p>This sign-in is a test identity. It cannot connect Google data or apps.</p>'
  :'<form action="/api/auth/google/start" method="POST"><input type="hidden" name="purpose" value="link">'+
   '<input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
   '<label class="choice"><input type="radio" name="godMode" value="true" checked><div><b>All permissions at once</b>'+
   '<span>Ask Google for every permission this service supports, in one go, including powerful administrator permissions. Google still decides what your account may grant.</span></div></label>'+
   '<label class="choice"><input type="radio" name="godMode" value="false"><div><b>Just one service</b>'+
   '<span>Pick it here: <select name="group" aria-label="Google service">'+
   services.map(group=>'<option value="'+escape(group)+'">'+escape(SERVICE_NAMES[group]||group)+'</option>').join('')+'</select></span></div></label>'+
   '<button>Continue with Google</button>'+
   '<p class="hint">Use this to add a second or third Google account, or more permissions for one you have. Google shows you exactly what you are allowing.</p></form>';
 const addSection='<section><h2>Your Google accounts</h2>'+denialNote+
  (freshConsentAvailable?'<p>You can now connect your own Google account. This does not move or change the original connection.</p>':'')+(accountCards||'<p>No Google account is connected yet.</p>')+
  '<h3>Add a Google account or more permissions</h3>'+addForm+'</section>';

 // Organisation access (admins only)
 const delegationSection='<section><details><summary>Organisation access for Google Workspace administrators</summary>'+
  '<p>Only if you administer a Google Workspace organisation and want your assistant to act across it with a service account you set up in your own Google Admin console. Most people never need this.</p>'+
  delegations.map(d=>'<div class="card"><b>'+escape(d.customer_id)+'</b> '+(d.configured?'<span class="tag good">on</span>':'<span class="tag">off</span>')+
   '<p class="hint">Mailboxes confirmed by Google: '+escape((d.subjects||[]).join(', ')||'none yet')+'.</p>'+
   '<form method="POST">'+hidden('verify_delegated_subject',d.account_id)+'<input type="hidden" name="customerId" value="'+escape(d.customer_id)+'">'+
   '<label>Add a mailbox in your organisation <input name="subject" type="email" required></label><button class="secondary">Add mailbox</button></form>'+
   '<form method="POST" class="inline">'+hidden('revoke_delegation',d.account_id)+'<input type="hidden" name="customerId" value="'+escape(d.customer_id)+'"><button class="secondary small">Turn off organisation access</button></form></div>').join('')+
  (accounts.length?'<form method="POST">'+hidden('setup_delegation')+
   '<label>Your administrator account <select name="id">'+accounts.map(a=>'<option value="'+escape(a.id)+'">'+escape(a.email)+'</option>').join('')+'</select></label>'+
   '<label>Service-account key (JSON). It is encrypted and never shown again. <textarea name="credential" rows="5" required autocomplete="off"></textarea></label>'+
   '<label>The Google permissions you allowed for it in your Admin console (one per line) <textarea name="scopes" rows="3" required></textarea></label>'+
   '<label class="choice"><input type="checkbox" name="confirm" value="true" required><div><b>I administer this organisation</b><span>and allowed exactly these permissions for this service account in its Admin console.</span></div></label>'+
   '<button class="secondary">Save organisation access</button></form>':'')+'</details></section>';

 const dataSection='<section><h2>Your data</h2><p>See what is stored for you, or ask for it to be removed. A removal request can be cancelled.</p>'+
  '<div class="row">'+button('delete_preview','','Show what is stored')+button('request_delete','','Ask to remove my data')+button('cancel_delete','','Cancel a removal request')+
  '<form action="/api/auth/logout" method="POST" class="inline"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><button class="secondary small">Sign out of this browser</button></form></div>'+
  '<p class="hint">Signing out here does not disconnect your apps. Read more: <a href="/api/privacy">privacy</a> · <a href="/api/data-deletion">disconnecting and deleting</a>.</p></section>';

 return brandPage('My Workspace connections','<h1>My Workspace connections</h1>'+banner+
  '<p>Everything you have connected, and what each app may do. Only you can see this page.</p>'+
  appsSection+addSection+delegationSection+dataSection,{wide:true});
}
