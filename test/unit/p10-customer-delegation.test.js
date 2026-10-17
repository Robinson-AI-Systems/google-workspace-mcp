// P10-5: actual Google SDK request shapes, independent customer consent,
// no secret escape, and no global owner delegated-key fallback.
import crypto from 'node:crypto';
import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';
const h=vi.hoisted(()=>({writes:[],oauthCalls:[],jwtCalls:[],responses:[],user:null,
  grant:{access_token:'synthetic-user-grant'},scopeAllowed:true,account:null}));
vi.mock('@neondatabase/serverless',()=>({neon:()=>async(parts,...params)=>{
  const sql=parts.join('?');h.writes.push({sql,params});
  if(sql.includes('INSERT INTO principal_delegations'))return [{id:'4ad42999-1111-4111-8111-111111111111'}];
  if(sql.includes('INSERT INTO principal_delegation_subjects'))return [{subject:'a@example.test'}];
  if(sql.includes('UPDATE principal_delegations SET enabled=false'))return [{id:'4ad42999-1111-4111-8111-111111111111'}];
  if(sql.includes('INSERT INTO principal_delegation_subjects')||sql.includes('DELETE FROM principal_delegation_subjects'))return [{subject:'a@example.test'}];
  return [];
}}));
vi.mock('googleapis',()=>({google:{
  auth:{
    OAuth2:class{constructor(){h.oauthCalls.push({constructor:true});}setCredentials(grant){h.oauthCalls.push({grant});this.credentials=grant;}},
    JWT:class{constructor(options){h.jwtCalls.push({options});}async authorize(){h.jwtCalls.push({authorized:true});return {access_token:'verified-delegation'};}}
  },
  admin:options=>({users:{get:async args=>{h.responses.push({options,args});return {data:h.user};}}}),
  gmail:options=>({kind:'gmail',options}),
  calendar:options=>({kind:'calendar',options}),
  drive:options=>({kind:'drive',options}),
  alertcenter:options=>({kind:'alert',options})
}}));
vi.mock('../../src/principals/google.js',()=>({
  publicGoogleClient:()=>({credentials:{},setCredentials(grant){h.oauthCalls.push({grant});this.credentials=grant;}})
}));
vi.mock('../../src/principals/store.js',()=>({
  findAccount:async(principalId,accountId)=>principalId==='11111111-1111-4111-8111-111111111111'
    &&accountId==='22222222-2222-4222-8222-222222222222'
    ?{id:accountId,principal_id:principalId,email:'a@example.test',
      status:'active',scope_list:h.scopeAllowed?['https://www.googleapis.com/auth/admin.directory.user.readonly']:[],token_version:0}:null,
  getLinkedGrant:async()=>h.grant,
  updateLinkedGrant:async()=>1
}));
const {
  configureCustomerDelegation,addVerifiedDelegationSubject,
  scopedDelegationClients,revokeCustomerDelegation
}=await import('../../src/principals/delegation.js');
const p='11111111-1111-4111-8111-111111111111';
const a='22222222-2222-4222-8222-222222222222';
const customer='Ctenant123';
const verifyScope='https://www.googleapis.com/auth/admin.directory.user.readonly';
const gmailScope='https://www.googleapis.com/auth/gmail.settings.basic';
const fakeKey=JSON.stringify({type:'service_account',client_email:'robot@tenant.iam.gserviceaccount.com',
  client_id:'12345678901234567890',project_id:'customer-project',
  private_key:'-----BEGIN PRIVATE KEY-----\nsynthetic_only\n-----END PRIVATE KEY-----'});
let before;
beforeEach(()=>{
  before={...process.env};process.env.TOKEN_ENCRYPTION_KEY=crypto.randomBytes(32).toString('base64');
  // SQL is mocked; a nonlive DSN merely satisfies the production availability guard.
  process.env.DATABASE_URL='postgres://synthetic:synthetic@127.0.0.1:5432/p10-unit-mocked';
  process.env.GOOGLE_SERVICE_ACCOUNT_JSON='{"private_key":"installation-owner-NEVER-used"}';
  h.writes=[];h.oauthCalls=[];h.jwtCalls=[];h.responses=[];h.scopeAllowed=true;
  h.grant={access_token:'synthetic-user-grant'};
  h.user={primaryEmail:'a@example.test',isAdmin:true,customerId:customer};
});
afterEach(()=>{process.env=before});
const args={principalId:p,accountId:a,credentialJson:fakeKey,scopes:[gmailScope]};
describe('P10-5 customer delegation authority and real Google SDK argument contract',()=>{
 it('refuses missing verified Admin OAuth scope before even constructing provider clients',async()=>{
   h.scopeAllowed=false;
   await expect(configureCustomerDelegation(args)).rejects.toThrow('admin_verification_scope_required');
   expect(h.responses).toHaveLength(0);expect(h.jwtCalls).toHaveLength(0);
   expect(h.writes.filter(x=>x.sql.includes('INSERT INTO principal_delegations'))).toHaveLength(0);
 });
 it('refuses unrelated/foreign customer, unknown administrator, and wrong linked account before credential persistence',async()=>{
   for(const user of [{primaryEmail:'a@example.test',isAdmin:false,customerId:customer},
       {primaryEmail:'b@example.test',isAdmin:true,customerId:customer},
       {primaryEmail:'a@example.test',isAdmin:true,customerId:'outside'}]){
     h.user=user;h.responses=[];h.jwtCalls=[];
     await expect(configureCustomerDelegation(args)).rejects.toThrow('verified_customer_admin_required');
     expect(h.jwtCalls).toHaveLength(0);
   }
   h.user={primaryEmail:'a@example.test',isAdmin:true,customerId:customer};
   await expect(configureCustomerDelegation({...args,accountId:'33333333-3333-4333-8333-333333333333'}))
     .rejects.toThrow('outside_scope');
 });
 it('first verifies the exact OAuth administrator/customer, then Google JWT consent, then stores ciphertext only',async()=>{
   const receipt=await configureCustomerDelegation(args);
   expect(h.responses[0]).toMatchObject({
     options:{version:'directory_v1'},args:{userKey:'a@example.test',projection:'basic'}
   });
   expect(h.jwtCalls).toMatchObject([
     {options:{email:'robot@tenant.iam.gserviceaccount.com',subject:'a@example.test',scopes:[gmailScope]}},
     {authorized:true}
   ]);
   const insert=h.writes.find(x=>x.sql.includes('INSERT INTO principal_delegations'));
   expect(insert).toBeTruthy();
   expect(JSON.stringify(insert.params)).not.toContain('synthetic_only');
   expect(JSON.stringify(insert.params)).toContain('v2.');
   expect(receipt).toMatchObject({configured:true,customerId:customer,
     subject:'a@example.test',secretStoredEncrypted:true,googleDelegationVerified:true});
   expect(JSON.stringify(receipt)).not.toContain('PRIVATE KEY');
 });
 it('independently checks delegated target mailbox and customer; bad response cannot enroll a subject',async()=>{
   h.responses=[];h.user={primaryEmail:'a@example.test',isAdmin:true,customerId:customer};
   // The account's own admin read and target read are two separate provider observations.
   let reads=0;
   const present=h.user;
   // Test a mismatched target using one mocked users.get result for both calls:
   // the second requested email is not the verified first identity.
   await expect(addVerifiedDelegationSubject(p,a,customer,'outsider@example.test'))
     .rejects.toThrow('delegated_subject_not_verified');
   expect(h.responses.map(x=>x.args.userKey)).toEqual(['a@example.test','outsider@example.test']);
   expect(h.writes.filter(x=>x.sql.includes('INSERT INTO principal_delegation_subjects'))).toHaveLength(0);
 });
 it('missing, unverified subject or scope refuses public delegation without touching installation-owner JSON',()=>{
   const empty=scopedDelegationClients(null);
   expect(()=>empty.forGmail('a@example.test')).toThrow('customer_delegation_not_configured');
   const tenant=scopedDelegationClients({
     customerId:customer,subject:'a@example.test',verifiedSubjects:['a@example.test'],
     scopes:[gmailScope],key:JSON.parse(fakeKey)
   });
   expect(()=>tenant.forGmail('b@example.test')).toThrow('customer_subject_not_verified');
   expect(()=>tenant.forGmail('a@example.test')).toThrow('customer_delegation_scope_missing');
   expect(()=>tenant.forServices('a@example.test',['https://www.googleapis.com/auth/calendar']))
     .toThrow('customer_delegation_scope_missing');
   expect(()=>tenant.forAlert('a@example.test')).toThrow('customer_delegation_scope_missing');
   expect(h.jwtCalls).toHaveLength(0);
 });
 it('revokes only the selected principal/account/customer and never claims Google provider revocation',async()=>{
   const result=await revokeCustomerDelegation(p,a,customer);
   expect(result).toEqual({revoked:true,providerRevocationClaimed:false});
   const write=h.writes.find(x=>x.sql.includes('UPDATE principal_delegations SET enabled=false'));
   expect(write?.params).toEqual(expect.arrayContaining([p,a,customer]));
 });
});
