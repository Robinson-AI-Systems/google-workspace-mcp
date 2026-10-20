import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeExceptionalRelease, exceptionReceipt } from './manual-exception.mjs';
import { decide } from './promote-live.mjs';
const main='b'.repeat(40),live='a'.repeat(40), day='2026-10-19';
const base={explicitOwnerApproval:true,authenticatedOwner:true,day,main,live,greenExactMain:true,
  liveAncestorOfMain:true,observedReadyLiveSha:live,existingExceptionBranches:[],
  originalDailyReceiptsPreserved:true,currentMainAndLiveRechecked:true};
test('one explicitly owner-approved same-day exception uses immutable full-SHA unique receipt',()=>{
  const d=authorizeExceptionalRelease(base);
  assert.equal(d.action,'LEASED_FAST_FORWARD_THEN_RECEIPT');
  assert.equal(d.checkedMain,main);
  assert.equal(d.expectedLive,live);
  assert.equal(d.receipt,'release-exceptions/'+day+'/'+main);
});
test('ordinary daily scheduled promoter still refuses any existing daily receipt',()=>{
  assert.equal(decide({main,live,alreadyToday:true,ancestor:true,green:true}),'skip');
});
test('every independent owner, source, lease, checks and original-receipt gate fails closed',()=>{
 for(const [key,value] of Object.entries({
   explicitOwnerApproval:false,authenticatedOwner:false,greenExactMain:false,
   liveAncestorOfMain:false,observedReadyLiveSha:main,originalDailyReceiptsPreserved:false,
   currentMainAndLiveRechecked:false,existingExceptionBranches:null
 })) assert.throws(()=>authorizeExceptionalRelease({...base,[key]:value}),undefined,key);
});
test('a prior same-day exception rejects another even for a different revision',()=>{
 assert.throws(()=>authorizeExceptionalRelease({...base,existingExceptionBranches:[exceptionReceipt(day,main)]}),/already recorded/);
});
test('receipt inventory and identifiers must be trusted and bounded',()=>{
 assert.throws(()=>exceptionReceipt('2026-99','z'.repeat(40)),/Invalid/);
 assert.throws(()=>authorizeExceptionalRelease({...base,existingExceptionBranches:['release-exceptions/2026-10-18/'+main]}),/invalid/);
 assert.throws(()=>authorizeExceptionalRelease({...base,main:'x'.repeat(40)}),/Invalid/);
});
test('unchanged refs are a safe no-op and cannot consume the exceptional receipt',()=>{
 assert.deepEqual(authorizeExceptionalRelease({...base,main:live}),{action:'NO_CHANGE',receipt:null});
});
