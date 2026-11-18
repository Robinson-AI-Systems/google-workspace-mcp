// Cloudflare's email hiding must not touch our pages (owner-raised, 2026-11-10).
import {describe,it,expect} from 'vitest';
import {brandPage,brandHeader,brandFooter} from '../../src/brand/brand.js';
describe('Cloudflare email hiding is switched off on our pages',()=>{
 it('every branded page wraps its content in the opt-out comments',()=>{
  const html=brandPage('t','<p>you@example.com</p>');
  const off=html.indexOf('<!--email_off-->'),on=html.indexOf('<!--/email_off-->'),at=html.indexOf('you@example.com');
  expect(off).toBeGreaterThan(-1);expect(off).toBeLessThan(at);expect(on).toBeGreaterThan(at);
 });
 it('the sign-in pages, which use the header and footer directly, are covered too',()=>{
  expect(brandHeader().startsWith('<!--email_off-->')).toBe(true);
  expect(brandFooter().endsWith('<!--/email_off-->')).toBe(true);
 });
});
