import {beforeEach,describe,it,expect,vi} from 'vitest';
import {CONNECTION_SETTINGS_FIELDS,CONNECTION_AREAS,normalizeConnectionPolicy,
 connectionPolicyToDb,verifyPolicyCopy,canUseConnectionTool
} from '../../src/oauth/connection-settings.js';
import {RTC_AREAS,allowedTool} from '../../src/rtc/catalog.js';

const holder=vi.hoisted(()=>({
  record:null,refresh:null,created:[],client:{client_id:'client-1',client_secret:'secret'}
}));
vi.mock('../../src/db.js',async importActual=>({
 ...(await importActual()),
 initSchema:vi.fn(async()=>{}),
 getOAuthClient:vi.fn(async()=>holder.client),
 consumeAuthCode:vi.fn(async()=>holder.record),
 getTokenByRefreshToken:vi.fn(async()=>holder.refresh),
 createAccessToken:vi.fn(async a=>{holder.created.push(a);})
}));
vi.mock('../../src/oauth/helpers.js',()=>({
 randomToken:()=> 'a'.repeat(43),
 verifyPkce:()=>true,
 parseBody:async req=>req.body
}));
const {default:handler}=await import('../../api/oauth/token.js');
const response=async body=>{
  const res={statusCode:0,body:null,status(value){this.statusCode=value;return this;},
    json(value){this.body=value;return this;}};
  await handler({method:'POST',body},res);
  return res;
};
const policy={profile:'read_only',listing:'compact',areas:['mail','calendar']};
const code={code:'auth',grant_type:'authorization_code',client_id:'client-1',
  client_secret:'secret',redirect_uri:'https://client.test/oauth/callback',
  code_verifier:'good'};
const storedCode={client_id:'client-1',redirect_uri:code.redirect_uri,
  code_challenge:'challenge',code_challenge_method:'S256',
  google_account:'ops@example.test',...policy};
const refresh={grant_type:'refresh_token',refresh_token:'refresh-1',
  client_id:'client-1',client_secret:'secret'};
beforeEach(()=>{
 holder.created.length=0;
 holder.client={client_id:'client-1',client_secret:'secret'};
 holder.record={...storedCode};
 holder.refresh={client_id:'client-1',google_account:'ops@example.test',...policy};
});

describe('P8-2 single connection-policy authority',()=>{
 it('keeps exact registry areas and profile-listing field inventory together',()=>{
   expect(CONNECTION_AREAS).toEqual(RTC_AREAS);
   expect(CONNECTION_SETTINGS_FIELDS).toEqual(['profile','listing','areas']);
   expect(Object.keys(connectionPolicyToDb(policy))).toEqual(CONNECTION_SETTINGS_FIELDS);
   expect(connectionPolicyToDb(policy)).toEqual(policy);
   expect(Object.isFrozen(normalizeConnectionPolicy(policy).areas)).toBe(true);
 });
 it('refuses missing, corrupt or privilege-escalating stored refresh settings',()=>{
   for(const corrupt of [
     {},{...policy,profile:undefined},{...policy,profile:null},
     {...policy,profile:'super_admin'}, {...policy,listing:undefined},
     {...policy,listing:'all'}, {...policy,areas:undefined},
     {...policy,areas:['mail','mail']},{...policy,areas:['mail','superuser']},
     {...policy,areas:'*'},{...policy,areas:Array(15).fill('mail')}
   ])expect(()=>connectionPolicyToDb(corrupt)).toThrow('invalid_connection_policy');
   expect(connectionPolicyToDb({},{grant:'authorization_code'})).toEqual({
     profile:'full',listing:'catalog',areas:null
   });
   expect(()=>connectionPolicyToDb({profile:null,listing:null,areas:null},
     {grant:'authorization_code'})).toThrow('invalid_connection_policy');
 });
 it('compares the actual complete copied fields, refusing silent downgrade or widening',()=>{
   expect(verifyPolicyCopy(policy,{...policy})).toBe(true);
   for(const changed of [
     {...policy,profile:'full'},{...policy,listing:'catalog'},
     {...policy,areas:null},{...policy,areas:['mail']}
   ])expect(()=>verifyPolicyCopy(policy,changed))
     .toThrow('connection_policy_widening_or_loss');
 });
 it('preserves read-only refusal consistently with the real registry',()=>{
   const metadata={writes:true,area:'mail'};
   expect(canUseConnectionTool('gmail_send_email',policy,metadata)).toBe(false);
   expect(allowedTool('gmail_send_email',policy)).toBe(false);
   expect(canUseConnectionTool('gmail_list_messages',policy,
     {writes:false,area:'mail'})).toBe(true);
   expect(canUseConnectionTool('gmail_list_messages',policy,
     {writes:false,area:'admin'})).toBe(false);
 });
});

describe('P8-2 actual OAuth issuance/refresh endpoint integration',()=>{
 it('copies ALL declared settings into token storage from code grant',async()=>{
   const out=await response(code);
   expect(out.statusCode).toBe(200);
   expect(holder.created).toHaveLength(1);
   expect(Object.fromEntries(CONNECTION_SETTINGS_FIELDS.map(k=>[k,holder.created[0][k]])))
      .toEqual(policy);
   expect(holder.created[0].googleAccount).toBe(storedCode.google_account);
 });
 it('keeps read_only profile and restrictive areas/listing across refresh',async()=>{
   const out=await response(refresh);
   expect(out.statusCode).toBe(200);
   expect(holder.created).toHaveLength(1);
   expect(Object.fromEntries(CONNECTION_SETTINGS_FIELDS.map(k=>[k,holder.created[0][k]])))
      .toEqual(policy);
   expect(holder.created[0].refreshToken).toBe('refresh-1');
 });
 it('a corrupt read-only refresh row NEVER silently becomes full',async()=>{
   for(const bad of [
     {...holder.refresh,profile:undefined},
     {...holder.refresh,listing:'wide_open'},
     {...holder.refresh,areas:['mail','mail']},
     {...holder.refresh,areas:['not-granted']}
   ]){
     holder.refresh=bad;
     const out=await response(refresh);
     expect(out.statusCode).toBe(400);
     expect(out.body.error).toBe('invalid_grant');
     expect(holder.created).toHaveLength(0);
   }
 });
 it('refuses invalid code-grant policy and never mints a default-full token',async()=>{
   for(const invalid of [
     {...storedCode,profile:undefined},
     {...storedCode,listing:null},
     {...storedCode,areas:['mail','not_an_area']}
   ]) {
     holder.record=invalid;
     const out=await response(code);
     expect(out.statusCode).toBe(400);
     expect(out.body.error).toBe('invalid_grant');
     expect(holder.created).toHaveLength(0);
   }
 });
 it('does not mint from a code when the OAuth client disappeared',async()=>{
   holder.client=null;
   const out=await response(code);
   expect(out.statusCode).toBe(401);
   expect(out.body.error).toBe('invalid_client');
   expect(holder.created).toHaveLength(0);
 });
 it('denies a missing OAuth client and mismatched refresh-client binding',async()=>{
   holder.client=null;
   let out=await response(refresh);
   expect(out.statusCode).toBe(401);
   holder.client={client_id:'client-1',client_secret:'secret'};
   holder.refresh={...holder.refresh,client_id:'other-client'};
   out=await response(refresh);
   expect(out.statusCode).toBe(400);
   expect(holder.created).toHaveLength(0);
 });
});
