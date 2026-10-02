// Small helpers shared by the safety tables (guards.js and the guards-*.js group files).
export const CUSTOMER = 'my_customer';
export const pick = (obj, keys) => Object.fromEntries(keys.filter((k) => obj?.[k] !== undefined).map((k) => [k, obj[k]]));
export const data = async (promise) => (await promise).data;
export const orgPath = (p) => String(p || '').replace(/^\//, '');

export const D = true; // destructive
// Google leaves out a field that is false, so compare true/false loosely but everything else exactly.
export const same = (got, wanted) => (typeof wanted === 'boolean' ? !!got === wanted : got === wanted);
export const SCALARS = new Set(['string', 'boolean', 'number']);
