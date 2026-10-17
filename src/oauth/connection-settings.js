// P8-2: single source of truth for OAuth connector policy. The access-token
// grant and every refresh MUST copy the same exact settings from the issuing
// row. Treat corrupt or missing existing policy as a denied refresh, not as
// an implicit upgrade to the full profile. Never infer a wider area grant.
import { normalizeBillingPolicy } from '../rtc/billing-authority.js';
export const CONNECTION_SETTINGS_FIELDS=Object.freeze(['profile','listing','areas','mode','costPolicy']);
export const CONNECTION_PROFILES=Object.freeze(['read_only','everyday','full']);
export const CONNECTION_LISTINGS=Object.freeze(['catalog','compact']);
export const CONNECTION_AREAS=Object.freeze([
 'mail','files','calendar','tasks','chat','admin','workspace','workflows',
 'dns','people','business','identity','datatransfer','licensing','chrome','domain'
]);
const allowedArea=new Set(CONNECTION_AREAS);
const shape=source=>source&&typeof source==='object'&&!Array.isArray(source);
const property=(x,key)=>Object.prototype.hasOwnProperty.call(x,key);
const recordsEqual=(a,b)=>CONNECTION_SETTINGS_FIELDS.every(key=>
 JSON.stringify(a?.[key])===JSON.stringify(b?.[key]));

export function normalizeConnectionPolicy(source,{grant='refresh_token'}={}) {
 if(!shape(source))throw Error('invalid_connection_policy');
 // A stored refresh token must never obtain full privileges merely because
 // its profile/listing/area columns are missing, null or an unknown enum.
 const legacy=grant==='authorization_code';
 if(grant!=='authorization_code'&&grant!=='refresh_token')
  throw Error('invalid_connection_policy_grant');
 const profile=legacy&&!property(source,'profile')?'full':source.profile;
 const listing=legacy&&!property(source,'listing')?'catalog':source.listing;
 const areas=legacy&&!property(source,'areas')?null:source.areas;
 // Explicit new connection modes do not silently reclassify legacy owner bearer rows.
 const mode=property(source,'mode')?source.mode:null;
 const costPolicy=normalizeBillingPolicy(property(source,'cost_policy')?source.cost_policy:source.costPolicy,
   {account:source.google_account || source.googleAccount});
 if(!CONNECTION_PROFILES.includes(profile)||!CONNECTION_LISTINGS.includes(listing)||
   ![null,'test','live'].includes(mode)||
   !(areas===null || Array.isArray(areas)&&areas.length<=CONNECTION_AREAS.length&&
     areas.every(area=>typeof area==='string'&&allowedArea.has(area))&&
     new Set(areas).size===areas.length))
  throw Error('invalid_connection_policy');
 return Object.freeze({profile,listing,areas:areas===null?null:Object.freeze([...areas]),mode,costPolicy});
}
export function connectionPolicyToDb(record,{grant='refresh_token'}={}) {
 const settings=normalizeConnectionPolicy(record,{grant});
 const copy={};
 for(const name of CONNECTION_SETTINGS_FIELDS) copy[name]=settings[name];
 return copy;
}
export function verifyPolicyCopy(issued,written,{grant='refresh_token'}={}) {
 const expected=connectionPolicyToDb(issued,{grant});
 const actual=connectionPolicyToDb(written,{grant});
 if(!recordsEqual(expected,actual))
  throw Error('connection_policy_widening_or_loss');
 return true;
}
export function canUseConnectionTool(tool,{profile,areas},classification) {
 // Test/debug policy evaluator. It is NOT a caller-controlled bypass of the
 // full registry policy enforcement; use the real RTC catalog in dispatch.
 if(!shape(classification)||!property(classification,'writes')||
    !property(classification,'area'))throw Error('missing_tool_classification');
 const p=normalizeConnectionPolicy({
  profile,listing:'catalog',areas:areas===undefined?null:areas
 });
 if(p.areas&& !p.areas.includes(classification.area))return false;
 if(p.profile==='read_only'&&classification.writes)return false;
 if(p.profile==='everyday'&&classification.writes&&
    ['admin','workspace','dns','licensing'].includes(classification.area))return false;
 return true;
}
