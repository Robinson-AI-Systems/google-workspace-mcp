import {describe,it,expect} from 'vitest';
import {legacyPilotFreshConsentAllowed,legacyPilotFreshConsentConfigured} from '../../src/principals/security.js';

const sub='123456789012345678901';
const base=()=>({
 PUBLIC_SIGNIN_MODE:'pilot',
 PUBLIC_PILOT_GOOGLE_SUBJECTS:'987654321012345678901,'+sub,
 PUBLIC_PILOT_LEGACY_SUBJECTS:sub,
 PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED:'true',
 PUBLIC_P10_TOOL_EXECUTION_VERIFIED:'false'
});
describe('historical test account fresh Google consent is separately owner gated',()=>{
 it('defaults OFF and admits only the existing verified legacy subject',()=>{
  expect(legacyPilotFreshConsentAllowed(sub,{...base(),PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED:undefined})).toBe(false);
  expect(legacyPilotFreshConsentAllowed(sub,base())).toBe(true);
  expect(legacyPilotFreshConsentConfigured(base())).toBe(true);
  expect(legacyPilotFreshConsentAllowed('987654321012345678901',base())).toBe(false);
 });
 it('fails closed outside two-subject pilot, including Stage 2 execution',()=>{
  const variants=[
   {PUBLIC_SIGNIN_MODE:'public'},
   {PUBLIC_SIGNIN_MODE:'off'},
   {PUBLIC_P10_TOOL_EXECUTION_VERIFIED:'true'},
   {PUBLIC_PILOT_GOOGLE_SUBJECTS:sub},
   {PUBLIC_PILOT_GOOGLE_SUBJECTS:sub+','+sub},
   {PUBLIC_PILOT_LEGACY_SUBJECTS:sub+',987654321012345678901'},
   {PUBLIC_PILOT_LEGACY_FRESH_GRANT_ENABLED:'false'}
  ];
  for(const patch of variants){
   const env={...base(),...patch};
   expect(legacyPilotFreshConsentAllowed(sub,env)).toBe(false);
   expect(legacyPilotFreshConsentConfigured(env)).toBe(false);
  }
 });
 it('switching the configured exception to the other tester does not authorize the original subject',()=>{
  const switched={...base(),PUBLIC_PILOT_LEGACY_SUBJECTS:'987654321012345678901'};
  // This is a syntactically valid, DIFFERENT operator-selected exception;
  // the database ownership check must still prove which enrolled principal
  // was originally marked identity-only before permitting a new link.
  expect(legacyPilotFreshConsentConfigured(switched)).toBe(true);
  expect(legacyPilotFreshConsentAllowed(sub,switched)).toBe(false);
  expect(legacyPilotFreshConsentAllowed('987654321012345678901',switched)).toBe(true);
 });
});
