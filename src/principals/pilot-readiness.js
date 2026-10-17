// Source-derived P10-6 preflight. This is deliberately *not* Google provider
// acceptance; no database/account, Google network, or production mutation here.
import {IDENTITY_SCOPES,PUBLIC_SCOPE_GROUPS} from './google.js';
import {supportContact} from './public-information.js';

const noSecret=(name,ok,remedy)=>({name,status:ok?'configured':'action_required',
  remedy:ok?null:remedy});
const canonical=value=>{
  try{
    const u=new URL(value);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||
      u.port||(u.pathname!==''&&u.pathname!=='/'))return null;
    return u.origin;
  }catch{return null;}
};
const configured=v=>typeof v==='string'&&v.trim().length>0;
export function pilotReadiness(env=process.env){
  const origin=canonical(env.PUBLIC_BASE_URL);
  const separateId=configured(env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID)&&
    (!configured(env.GOOGLE_OAUTH_CLIENT_ID)||
      env.PUBLIC_GOOGLE_OAUTH_CLIENT_ID!==env.GOOGLE_OAUTH_CLIENT_ID);
  const distinctSecret=configured(env.PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET)&&
    (!configured(env.GOOGLE_OAUTH_CLIENT_SECRET)||
      env.PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET!==env.GOOGLE_OAUTH_CLIENT_SECRET);
  const roster=String(env.PUBLIC_PILOT_GOOGLE_SUBJECTS||'').split(',')
    .map(v=>v.trim()).filter(Boolean);
  const unique=new Set(roster);
  const tokenKey=String(env.TOKEN_ENCRYPTION_KEY||'');
  const key=Buffer.from(tokenKey,'base64');
  const encryptionReady=key.length===32&&key.toString('base64')===tokenKey;
  const mode=env.PUBLIC_SIGNIN_MODE??'off';
  const validMode=['off','pilot','public'].includes(mode);
  const verifiedFlag=env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED==='true';
  const checks=[
    noSecret('Canonical HTTPS base URL',!!origin,'Set PUBLIC_BASE_URL to a single canonical HTTPS origin.'),
    noSecret('Separate public Google OAuth client ID',separateId,
      'Configure PUBLIC_GOOGLE_OAUTH_CLIENT_ID from a distinct Google OAuth client, never the owner client.'),
    noSecret('Separate public Google OAuth client secret',distinctSecret,
      'Configure the matching PUBLIC_GOOGLE_OAUTH_CLIENT_SECRET directly in protected environment settings.'),
    noSecret('Encrypted V2 grants',encryptionReady,
      'A 32-byte base64 TOKEN_ENCRYPTION_KEY must already exist; do not rotate the working owner key.'),
    noSecret('Original owner OAuth preserved',configured(env.GOOGLE_OAUTH_CLIENT_ID)&&
      configured(env.GOOGLE_OAUTH_CLIENT_SECRET),
      'Preserve the existing owner Google OAuth ID and secret; do not borrow them for pilot login.'),
    noSecret('Owner passphrase preserved',configured(env.ADMIN_PASSPHRASE),
      'Keep the current owner login working during pilot; do not retire it.'),
    noSecret('Public sign-in mode',validMode&&mode!=='public',
      'Use off before checked release and pilot only after owner-authorized readiness; public requires distinct publication approval.'),
    noSecret('Two unique verified pilot subjects configured',roster.length>=2&&roster.length===unique.size,
      'Enroll at least two different Google-verified OIDC subject IDs, not email or domain guesses.'),
    noSecret('Public support contact',!!supportContact(env),
      'Review and configure PUBLIC_SUPPORT_EMAIL for the support page and consent screen.')
  ];
  const scopes={identity:[...IDENTITY_SCOPES]};
  for(const [area,group] of Object.entries(PUBLIC_SCOPE_GROUPS)){
    scopes[area]=[...group];
  }
  // No environment secret, test subject, mailbox, private provider credential,
  // raw token or account number may be included in this report.
  return {
    kind:'p10_pilot_readiness',
    sourceOnly:true,
    pilotAcceptancePassed:false,
    publicPublicationApproved:false,
    currentMode:validMode?mode:'invalid',
    toolExecutionFlagEnabled:verifiedFlag,
    legacyOwnerNewSignInEnabled:env.LEGACY_OWNER_SIGNIN_ENABLED!=='false',
    pilotRosterCount:roster.length,
    configuredItems:checks.filter(c=>c.status==='configured').length,
    checkedItems:checks.length,
    configComplete:checks.every(c=>c.status==='configured'),
    checks,
    expectedUrls:{
      homepage:origin?origin+'/':null,
      privacy:origin?origin+'/api/privacy':null,
      support:origin?origin+'/api/support':null,
      deletion:origin?origin+'/api/data-deletion':null,
      oauthCallback:origin?origin+'/api/auth/google/callback':null,
      mcpResource:origin?origin+'/api/mcp':null
    },
    scopes,
    manualEvidenceStillRequired:[
      'Verify you own the homepage domain in Google Search Console and match the OAuth consent screen.',
      'Independently review and approve privacy/retention disclosures and support contact.',
      'Confirm exact client project, authorized redirect, consent testers and Google-verified subject IDs.',
      'Check Google requested-scope classification, brand and any sensitive/restricted-scope verification or exception.',
      'Prove checked READY deployment and old owner/native/Hub TEST continuation before pilot activation.',
      'Run two distinct real Google users and real MCP clients: authorized read, denial, revoke and cleanup.',
      'Obtain separate exact approval for any reversible Google write and for subsequent public publication.'
    ]
  };
}
