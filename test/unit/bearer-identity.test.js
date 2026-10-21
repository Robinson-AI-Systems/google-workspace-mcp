import {it,expect} from 'vitest';
import {readBearer} from '../../src/oauth/bearer.js';
it('preserves identity bytes under legal scheme casing and horizontal whitespace',()=>{
 for(const prefix of ['Bearer ','bearer ','BEARER\t','bEaReR  '])
  for(const token of ['p10a_AbC123-_.','LegacyMixedCase+012/=','rtc_pass_AbCdEf'])
   expect(readBearer(prefix+token)).toBe(token);
});
it('rejects malformed/multiple/non-Bearer credentials without changing principal markers',()=>{
 for(const value of [undefined,null,[],{},'','Bearer','Bearer ','Basic abc',
  'Bearer token extra','Bearer\ntoken','Bearer token\n','Bearer token\r\n','Bearer token,another',' Bearer token'])
  expect(readBearer(value)).toBeNull();
 expect(readBearer('bearer P10A_AbCd')).toBe('P10A_AbCd');
});
