// User-owned account portal. No global owner mailbox/connection listing.
import {initSchema} from '../src/db.js';
import {listAccounts,listConnections,revokeConnection,disconnectAccount,deletionPreview,
  setPrincipalDefault,requestDeletion,cancelDeletion} from '../src/principals/store.js';
import {requireSession,requireCsrf,CSRF_COOKIE} from '../src/principals/session.js';
import {readCookie,headers} from '../src/principals/security.js';
const escape=x=>String(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function handler(req,res){
 headers(res);
 if(!['GET','POST'].includes(req.method))return res.status(405).send('Method not allowed');
 try{
   await initSchema();
   const session=await requireSession(req),principalId=session.principal_id;
   if(req.method==='POST'){
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
     if(action==='set_default'){
       return res.status(200).json({defaultAccountId:await setPrincipalDefault(principalId,body.id)});
     }
     if(action==='delete_preview')return res.status(200).json(await deletionPreview(principalId));
     if(action==='request_delete')return res.status(200).json(await requestDeletion(principalId));
     if(action==='cancel_delete')return res.status(200).json(await cancelDeletion(principalId));
     return res.status(400).json({error:'unknown_action'});
   }
   const accounts=await listAccounts(principalId),connections=await listConnections(principalId);
   const csrf=readCookie(req,CSRF_COOKIE)||'';
   if(!csrf)return res.status(401).send('Session CSRF state missing.');
   res.setHeader('Content-Type','text/html; charset=utf-8');
   const form=(action,id,label)=>'<form method="POST"><input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
      '<input type="hidden" name="action" value="'+escape(action)+'">'+
      '<input type="hidden" name="id" value="'+escape(id)+'"><button>'+escape(label)+'</button></form>';
   const links=Object.keys({mail:true,files:true,calendar:true,tasks:true,contacts:true})
     .map(group=>'<form action="/api/auth/google/start" method="POST"><input type="hidden" name="purpose" value="link">'+
       '<input type="hidden" name="group" value="'+group+'"><input type="hidden" name="csrf" value="'+escape(csrf)+'">'+
       '<button>Link Google '+group+' permissions</button></form>').join('');
   const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
     '<title>My Workspace connections</title><main style="max-width:720px;margin:auto;font:16px/1.5 system-ui;padding:1rem">'+
     '<h1>My Google Workspace MCP</h1><p>Only this authenticated principal’s accounts and agent connections appear here.</p>'+
     '<h2>Google connections</h2><ul>'+accounts.map(a=>'<li>'+escape(a.label||a.email)+' · '+
       escape(a.scope_list.join(', '))+' · '+(a.is_default?'Default':'Linked')+
       form('set_default',a.id,'Make default')+form('disconnect_account',a.id,'Disconnect locally')+'</li>').join('')+'</ul>'+
     '<h2>Link an account / add permissions</h2>'+links+
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
