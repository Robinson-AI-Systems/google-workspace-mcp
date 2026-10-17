// P9-2: intent digest and connection-owned spending policy; no guessed prices.
// A request digest proves matching arguments, NOT who approved them.
import { createHash } from 'node:crypto';
export const BILLABLE_BULK_OPERATIONS = Object.freeze(['assign_license','change_license']);
const email=v=>typeof v==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const object=v=>v&&typeof v==='object'&&!Array.isArray(v);
const defaultPolicy=()=>Object.freeze({mode:'per_action'});
export function normalizeBillingPolicy(raw,{account}={}) {
  if (raw===undefined||raw===null) return defaultPolicy(); // existing owner credentials
  let value=raw;
  if(typeof value==='string'){try{value=JSON.parse(value);}catch{throw Error('invalid_billing_policy');}}
  if(!object(value)||!['per_action','deny','standing'].includes(value.mode))throw Error('invalid_billing_policy');
  if(value.mode!=='standing') {
    if(Object.keys(value).some(key=>key!=='mode'))throw Error('invalid_billing_policy');
    return Object.freeze({mode:value.mode});
  }
  const bound=String(value.account||'').trim().toLowerCase();
  if(!email(bound)||!Array.isArray(value.operations)||value.operations.length<1||
     value.operations.length>BILLABLE_BULK_OPERATIONS.length||
     new Set(value.operations).size!==value.operations.length||
     value.operations.some(op=>!BILLABLE_BULK_OPERATIONS.includes(op))||
     value.allowUnknownPrice!==true ||
     (value.maxChargeUsd!==null&&value.maxChargeUsd!==undefined&&
       (!Number.isFinite(value.maxChargeUsd)||value.maxChargeUsd<=0))||
     Object.keys(value).some(key=>!['mode','account','operations','allowUnknownPrice','maxChargeUsd'].includes(key)))
    throw Error('invalid_billing_policy');
  if(account&&String(account).trim().toLowerCase()!==bound)throw Error('billing_account_mismatch');
  return Object.freeze({mode:'standing',account:bound,operations:Object.freeze([...value.operations].sort()),
    allowUnknownPrice:true,maxChargeUsd:value.maxChargeUsd??null});
}
export function selectedBillingPolicy(selection,account,{acceptedUnknown=false}={}) {
  if(selection===undefined||selection==='per_action')return defaultPolicy();
  if(selection==='deny')return Object.freeze({mode:'deny'});
  const choices={
    standing_assign:['assign_license'],standing_change:['change_license'],
    standing_both:['assign_license','change_license']
  };
  if(!Object.hasOwn(choices,selection)||acceptedUnknown!==true)throw Error('Cost delegation needs explicit acknowledgement of unknown and potentially unbounded charges.');
  return normalizeBillingPolicy({mode:'standing',account,operations:choices[selection],
    allowUnknownPrice:true,maxChargeUsd:null},{account});
}
export function billingNotice(a) {
  const parameters=Object.fromEntries(Object.entries(a.parameters).sort(([x],[y])=>x.localeCompare(y)));
  const exact={operation:a.operation,sortedNormalizedTargets:[...a.targets].sort(),parameters};
  const requestDigest=createHash('sha256').update(JSON.stringify(exact)).digest('hex');
  return {mayIncurCharges:true,estimateStatus:'unknown',
    priceEstimate:null,currency:null,unknownOrUnboundedExposure:true,
    operation:a.operation,targetCount:a.targets.length,targets:exact.sortedNormalizedTargets,
    productId:a.parameters.productId,skuId:a.parameters.skuId,
    ...(a.parameters.newSkuId?{newSkuId:a.parameters.newSkuId}:{}),
    requestDigest,notice:'Google licensing charges depend on the account agreement and subscription. No price has been verified; ask the user before applying.'};
}
export function evaluateBillingAuthority(raw,a,actingAs) {
  let policy;
  try{policy=normalizeBillingPolicy(raw);}catch{return {kind:'refused',reason:'invalid_saved_billing_policy'};}
  if(policy.mode==='deny')return {kind:'refused',reason:'user_denied_spending'};
  if(policy.mode==='per_action')return {kind:'per_action'};
  if(!email(actingAs)||actingAs.trim().toLowerCase()!==policy.account||
     !policy.operations.includes(a.operation))
    return {kind:'refused',reason:'standing_cost_scope_mismatch'};
  // Real account-specific price is not available through the licensing API.
  // A finite cap cannot be verified; refusing protects the owner's own limit.
  if(policy.maxChargeUsd!==null)return {kind:'refused',reason:'spending_cap_unverifiable'};
  return {kind:'standing'};
}
