// P8-7: make multi-resource app readiness actionable and machine-readable.
// The summary never upgrades unobservable permissions to ready, and only
// reports canonical Google Console URLs already supplied by safe check guides.
const STATES=['ready','missing','not_readable'];
const own=(value,key)=>Object.prototype.hasOwnProperty.call(value,key);
export function summarizeAppReadiness(checks){
 if(!Array.isArray(checks))throw Error('App readiness requires an array of provider checks.');
 const totals={ready:0,missing:0,not_readable:0};
 const byKind=Object.create(null),areas=Object.create(null),guides=new Map();
 for(const check of checks){
  if(!check||typeof check.kind!=='string'||!STATES.includes(check.status))
   throw Error('Invalid provider check status; cannot report app readiness.');
  totals[check.status]++;
  if(!own(byKind,check.kind))byKind[check.kind]={ready:0,missing:0,not_readable:0};
  byKind[check.kind][check.status]++;
  const area=check.kind.startsWith('gmail')?'mail':
    check.kind.startsWith('drive')||['document','spreadsheet','presentation','form'].includes(check.kind)?'files':
    check.kind.startsWith('calendar')?'calendar':
    check.kind.startsWith('task')?'tasks':
    check.kind.startsWith('chat')?'chat':
    check.kind==='contact'?'people':
    check.kind==='api'?'api':
    check.kind==='oauth_scope'?'oauth':
    check.kind==='delegated_scope'||check.kind==='service_account_client_id'?'delegation':'other';
  if(!own(areas,area))areas[area]={ready:0,missing:0,not_readable:0};
  areas[area][check.status]++;
  // Google Console links are fixed by trusted code, never by a provider
  // error or user argument. Group them by destination, not by resource ID.
  const url=check.fix?.url;
  if(check.status!=='ready'&&typeof url==='string'&&
    /^https:\/\/(?:console\.cloud\.google\.com|admin\.google\.com|calendar\.google\.com|drive\.google\.com|mail\.google\.com|tasks\.google\.com|chat\.google\.com|contacts\.google\.com|docs\.google\.com|sheets\.google\.com|slides\.google\.com|forms\.google\.com)(?:\/|$)/.test(url)&&!guides.has(url))
   guides.set(url,{url,reason:check.reason||'access_check_not_ready',kind:check.kind});
 }
 const total=checks.length;
 return {
  total,ready:totals.ready,missing:totals.missing,notReadable:totals.not_readable,
  complete:total>0&&totals.ready===total,
  status:total===0?'not_readable':totals.missing?'missing':
    totals.not_readable?'not_readable':'ready',
  byKind,byArea:areas,
  nextSteps:[...guides.values()].slice(0,8),
  note:'Only independent observed Google reads are ready. A metadata capability or admin setting is not a successful provider write.'
 };
}
