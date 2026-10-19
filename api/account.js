// User-owned account portal. No global owner mailbox/connection listing.
import {initSchema} from '../src/db.js';
import {PRODUCT_DISPLAY_NAME,PROVIDER_DISCLOSURE} from '../src/branding.js';
import {listAccounts,listConnections,revokeConnection,disconnectAccount,deletionPreview,
  setPrincipalDefault,requestDeletion,cancelDeletion,isLegacyPilotIdentityPrincipal,
  canLegacyPilotStartFreshConsent,getLinkedGrant} from '../src/principals/store.js';
import {requireSession,requireCsrf,CSRF_COOKIE} from '../src/principals/session.js';
import {configureCustomerDelegation,listCustomerDelegations,revokeCustomerDelegation,
  addVerifiedDelegationSubject,removeDelegationSubject} from '../src/principals/delegation.js';
import {readCookie,headers,publicMode,requireScope} from '../src/principals/security.js';
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
     res.setHeader('Content-Type','text/html; charset=utf-8');
     return res.status(401).send('<!doctype html><html lang="en"><meta charset="utf-8">'+
       '<title>Sign in — '+escape(PRODUCT_DISPLAY_NAME)+'</title>'+
       '<main style="font:16px/1.5 system-ui;max-width:42rem;margin:3rem auto">'+
       '<h1>Sign in to your Workspace account</h1>'+
       '<p>This browser has no active pilot account session. Your existing owner MCP connections are separate and unchanged.</p>'+
       '<p><a href="/api/auth/google/start?purpose=login">Sign in with your approved Google account</a></p></main>');
   }
   const principalId=session.principal_id;
   const identityOnly=await isLegacyPilotIdentityPrincipal(principalId);
   const freshConsentAvailable=identityOnly&&await canLegacyPilotStartFreshConsent(principalId);
   if(req.method==='POST'){
     if(identityOnly)return res.status(403).json({error:'legacy_pilot_identity_only'});
     const body=req.body&&typeof req.body==='object'?req.body:{};
     requireCsrf(req,session,body);
     const action=body.action;
     if(action==='revoke_connection'){
       return res.status(200).json({revoked:await revokeConnection(principalId,body.id)});
     }
     if(action==='disconnect_account'){
       return res.status(200).json({disconnected:await disconnectAccount(principalId,body.id),
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
       let providerRevoked=false;
       try {
         const grant=await getLinkedGrant(principalId,body.id);
         const token=grant?.refresh_token||grant?.access_token;
         if(token){
           await publicGoogleClient().revokeToken(token);
           providerRevoked=true;
         }
       }catch{ /* never expose Google tokens, provider errors or owner identity */ }
       const disconnected=await disconnectAccount(principalId,body.id);
       return res.status(200).json({godMode:false,disconnected,
         agentConnectionsRevoked:disconnected>0,providerRevoked,
         note:providerRevoked
           ?'Google app permission revocation was confirmed. This account and its agents are also disabled locally. To resume, authorize only the services you choose and reconnect your agent.'
           :'Account and agent access are stopped locally. Google provider-wide authorization could not be confirmed revoked. Review your Google Account third-party access settings to revoke this app at Google, then reauthorize only the services you choose.'});
     }
     if(action==='set_default'){
       return res.status(200).json({defaultAccountId:await setPrincipalDefault(principalId,body.id)});
     }
     if(action==='setup_delegation'){
       if(body.confirm!==true&&body.confirm!=='true')return res.status(400).json({error:'owner_confirmation_required'});
       const scopes=Array.isArray(body.scopes)?body.scopes:String(body.scopes||'').split(/[\s,]+/).filter(Boolean);
       const receipt=await configureCustomerDelegation({principalId,accountId:body.id,
         credentialJson:body.credential,scopes});
       return res.status(200).json(receipt);
     }
     if(action==='revoke_delegation')return res.status(200).json(await revokeCustomerDelegation(principalId,body.id,body.customerId));
     if(action==='verify_delegated_subject')return res.status(200).json(await addVerifiedDelegationSubject(principalId,body.id,body.customerId,body.subject));
     if(action==='remove_delegated_subject')return res.status(200).json(await removeDelegationSubject(principalId,body.id,body.customerId,body.subject));
     if(action==='delete_preview')return res.status(200).json(await deletionPreview(principalId));
     if(action==='request_delete')return res.status(200).json(await requestDeletion(principalId));
     if(action==='cancel_delete')return res.status(200).json(await cancelDeletion(principalId));
     return res.status(400).json({error:'unknown_action'});
   }
   const accounts=await listAccounts(principalId),connections=await listConnections(principalId),
     delegations=await listCustomerDelegations(principalId);
   const csrf=readCookie(req,CSRF_COOKIE)||'';
   if(!csrf)return res.status(401).send('Session CSRF state missing.');
   res.setHeader('Content-Type','text/html; charset=utf-8');
   const form=(action,id,label)=>'<form method="POST"><input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
      '<input type="hidden" name="action" value="'+escape(action)+'">'+
      '<input type="hidden" name="id" value="'+escape(id)+'"><button>'+escape(label)+'</button></form>';
   // Pilot accepts broad Google scopes in one pass. Ordinary customers begin
   // with a single service, and may optionally request broader Google consent.
   // This is still the user's actual Google consent, not a bypass of OAuth.
   const mode=publicMode();
   const services=Object.keys(PUBLIC_SCOPE_GROUPS).filter(group=>group!=='complete');
   const authorizeForm=pilot=>'<form action="/api/auth/google/start" method="POST">'+
     '<input type="hidden" name="purpose" value="link">'+
     '<input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
     '<label>Google service <select name="group">'+
     services.map(group=>'<option value="'+escape(group)+'">'+escape(group)+'</option>').join('')+
     '</select></label>'+
     '<p><label><input type="checkbox" name="godMode" value="true"'+(pilot?' checked':'')+'>'+
     ' <strong>God mode — request all supported Google permissions together</strong></label></p>'+
     '<p>God mode asks Google for all '+PUBLIC_SCOPE_GROUPS.complete.length+
     ' direct-user OAuth permissions this MCP supports, including powerful administrator-related permissions. '+
     'Google still requires your consent and may require restricted-scope verification, a real admin role, separate customer delegation or paid licensing. '+
     'You can turn off God mode later; doing so locally disconnects this Google grant and its connected agents. '+
     'You can revoke the Google permission at Google when turning it off, and separately check or remove the app from your Google Account third-party access settings if the provider cannot confirm revocation.</p>'+
     '<button>Continue to Google consent</button></form>';
   const disableGodMode=a=>'<form method="POST">'+
     '<input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
     '<input type="hidden" name="action" value="disable_god_mode">'+
     '<input type="hidden" name="id" value="'+escape(a.id)+'">'+
     '<label><input type="checkbox" name="confirm" value="true" required>'+
     ' I understand this revokes the broad provider authorization where Google permits, stops this account locally, revokes its agent connections, '+
     'and requires new selected-service consent to continue. Google may require manual third-party access removal if revocation fails.</label>'+
     '<button>Turn off God mode</button></form>';
   const consentChoice=mode==='pilot'
     ? '<h3>Approved pilot: comprehensive Google acceptance setup</h3>'+
       '<p>For the approved development testers, God mode starts checked so all supported scopes can be requested together before live testing. Uncheck it for one service only. Google must still approve each requested scope.</p>'+
       authorizeForm(true)
     : '<h3>Authorize Google permissions as needed</h3>'+
       '<p>Select the service you want. God mode is optional and off by default. You can enable it at any time to request all supported direct-user permissions at once.</p>'+
       authorizeForm(false);
   const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
     '<title>My Workspace connections</title><main style="max-width:720px;margin:auto;font:16px/1.5 system-ui;padding:1rem">'+
     '<h1>'+escape(PRODUCT_DISPLAY_NAME)+'</h1><p>'+escape(PROVIDER_DISCLOSURE)+'</p><p>Only this authenticated principal’s accounts and agent connections appear here.</p>'+
     '<p>Before linking mail, files or administrator scopes, review how Google data is used by your selected agent: '+
     '<a href="/api/privacy">privacy and data use</a>, <a href="/api/support">support</a> and '+
     '<a href="/api/data-deletion">local disconnection and deletion limits</a>. Google controls which requested permissions you approve.</p>'+
     '<h2>Google connections</h2><ul>'+accounts.map(a=>'<li>'+escape(a.label||a.email)+' · '+
       escape(a.scope_list.join(', '))+' · '+(a.is_default?'Default':'Linked')+
       form('set_default',a.id,'Make default')+
       (PUBLIC_SCOPE_GROUPS.complete.every(scope=>a.scope_list.includes(scope))
         ? ' · God mode active locally'+disableGodMode(a)
         : form('disconnect_account',a.id,'Disconnect locally'))+'</li>').join('')+'</ul>'+
     (identityOnly&&!freshConsentAvailable
       ? '<h2>Identity-only legacy tester</h2><p>This verified pilot login is intentionally separate from your original owner MCP. Existing Google connections stay with the original owner. This pilot identity cannot link Google data or issue MCP tool connections until a separately approved fresh consent.</p>'
       : '<h2>Link an account / add permissions</h2>'+
         (freshConsentAvailable?'<p>You may now independently consent for your own Google account. This does not transfer, share or revoke original owner grants.</p>':'')+consentChoice)+
     '<h2>Customer administrator delegation</h2>'+
     '<p>This is optional and only for administrators of their own verified Google Workspace customer. First link the separate read-only Admin Verification permission above. An existing login and its grants stay intact. Domain name or email alone never grants authority.</p>'+
     '<p>A service-account key is submitted only over this signed-in HTTPS form with CSRF protection, encrypted per account in the database, and never shown again. The Google administrator must separately authorize the selected scopes for this service account in their own Admin Console. Enter only scopes required for the intended operations. Missing configuration does not disable ordinary Google access.</p>'+
     '<ul>'+delegations.map(d=>'<li>'+escape(d.customer_id)+' · '+escape(d.subject_rule)+' · '+
       'Verified delegated mailboxes: '+escape((d.subjects||[]).join(', ')||'(none)')+' · '+
       escape(d.scopes.join(', '))+' · '+(d.configured?'Configured':'Disabled')+
       '<form method="POST"><input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
       '<input type="hidden" name="action" value="revoke_delegation">'+
       '<input type="hidden" name="id" value="'+escape(d.account_id)+'">'+
       '<input type="hidden" name="customerId" value="'+escape(d.customer_id)+'">'+
       '<button>Revoke this delegation locally</button></form>'+ 
       '<form method="POST"><input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
       '<input type="hidden" name="action" value="verify_delegated_subject">'+
       '<input type="hidden" name="id" value="'+escape(d.account_id)+'">'+
       '<input type="hidden" name="customerId" value="'+escape(d.customer_id)+'">'+
       '<label>Add a mailbox independently verified by Google Directory <input name="subject" type="email" required></label>'+ 
       '<button>Verify mailbox</button></form></li>').join('')+'</ul>'+
     '<form method="POST"><input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
       '<input type="hidden" name="action" value="setup_delegation">'+
       '<label>Owned linked account <select name="id">'+accounts.map(a=>'<option value="'+escape(a.id)+'">'+escape(a.email)+'</option>').join('')+'</select></label><p>'+ 
       '<label>Service-account key JSON (never returned) <textarea name="credential" rows="5" required autocomplete="off"></textarea></label></p>'+ 
       '<p><label>Selected authorized Google OAuth scope URLs (comma or newline separated) <textarea name="scopes" rows="3" required></textarea></label></p>'+ 
       '<label><input type="checkbox" name="confirm" value="true" required> I administer this Google customer and authorized the exact service-account scopes in its Admin Console.</label>'+ 
       '<p><button>Verify and save encrypted delegation</button></p></form>'+
     '<h2>Agent access</h2><ul>'+connections.map(c=>'<li>'+escape(c.client_id)+' / '+escape(c.profile)+
       ' · '+escape(c.id)+form('revoke_connection',c.id,'Revoke this agent connection')+'</li>').join('')+'</ul>'+
     '<h2>Account deletion</h2><p>Preview counts before any irreversible decision. No deletion occurs on this page; Google grants and retained audit data may require separate treatment.</p>'+
       form('delete_preview','','Preview deletion')+
       form('request_delete','','Request recoverable deletion (no irreversible removal)')+
       form('cancel_delete','','Cancel pending deletion')+
     '<form action="/api/auth/logout" method="POST"><input type="hidden" name="csrf" value="'+escape(csrf)+'"><button>Log out of this browser (agents remain)</button></form></main>';
   return res.status(200).send(html);
 }catch{return res.status(403).json({error:'invalid_session_or_scope'});}
}
