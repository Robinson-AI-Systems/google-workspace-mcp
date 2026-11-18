import {describe,it,expect} from 'vitest';
import {explainError} from '../../src/tools/errors.js';
describe('a saved sign-in Google will not renew',()=>{
 it('is explained as a reconnect, not a server-setup problem',()=>{
  const out=explainError(new Error('google_reconnect_required'));
  expect(out.what).toContain('would not renew');
  expect(out.todo).toContain('add it again');
  expect(JSON.stringify(out)).not.toContain('robot');
 });
});
