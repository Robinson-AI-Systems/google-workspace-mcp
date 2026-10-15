// Review categories for every currently mapped Google Admin/Gmail setting.
// A category is a navigation aid, not proof that a Google policy can be read.
import { CONSOLE_MAP } from './console-map.js';

const reviewIds=(category,existing)=>Object.freeze([...existing,
 ...CONSOLE_MAP.filter(entry=>entry.reviewCategory===category).map(entry=>entry.id)]);

export const CONSOLE_REVIEW_GROUPS = Object.freeze({
  mail: reviewIds('mail',['dkim','gmail-routing','gmail-compliance','gmail-spam','gmail-default-routing-delegation',
    'gmail-imap-pop','gmail-enable-disable','email-log-search','email-forwarding',
    'out-of-office','signature','spf-dmarc','gmail-send-limits']),
  security: reviewIds('security',['session-length','password-policy','2sv','recovery','less-secure-apps',
    'marketplace-allowlist','api-controls','security-investigation','context-aware-access',
    'sso','admin-roles','alerts']),
  collaboration: reviewIds('collaboration',['calendar-sharing','calendar-resources','drive-sharing','drive-shared-drives',
    'drive-storage','drive-dlp','meet-settings','chat-external','groups-settings']),
  organization: reviewIds('organization',['services-on-off','gemini','data-regions','directory-visibility',
    'takeout','vault-retention','domains','org-units','users','company-branding','support-pin','reports']),
  devices: reviewIds('devices',['mobile-management','chrome-management']),
  billing: reviewIds('billing',['billing-plan','license-assign-ui'])
});
export const CONSOLE_REVIEW_CATEGORIES = Object.freeze(Object.keys(CONSOLE_REVIEW_GROUPS));

const idToGroup=new Map(Object.entries(CONSOLE_REVIEW_GROUPS).flatMap(([category,ids])=>ids.map(id=>[id,category])));

// Export an invariant check for CI: a new console entry cannot silently go
// missing from the review workflow, and no duplicate ID can hide an entry.
export function consoleReviewCoverageErrors(entries=CONSOLE_MAP){
  const actual=entries.map(e=>e.id), assigned=Object.values(CONSOLE_REVIEW_GROUPS).flat();
  const seen=new Set(), errors=[];
  for(const id of actual){
    if(seen.has(id))errors.push('Duplicate console entry: '+id);
    seen.add(id);
    if(!idToGroup.has(id))errors.push('Unclassified console entry: '+id);
  }
  seen.clear();
  for(const id of assigned){
    if(seen.has(id))errors.push('Multiple review categories for: '+id);
    seen.add(id);
    if(!actual.includes(id))errors.push('Stale review category: '+id);
  }
  return errors;
}

export function buildConsoleReview({category,page=1,pageSize=10,query=''}={},verifyStatus){
  if(category!==undefined&&!CONSOLE_REVIEW_CATEGORIES.includes(category))
    throw Error('Unknown review category. Choose: '+CONSOLE_REVIEW_CATEGORIES.join(', '));
  if(!Number.isSafeInteger(page)||page<1||page>1000||
     !Number.isSafeInteger(pageSize)||pageSize<1||pageSize>20)
    throw Error('Review page must be 1–1000 and pageSize must be 1–20.');
  if(typeof query!=='string'||query.length>120)
    throw Error('Review query must be text no longer than 120 characters.');
  const q=query.toLowerCase().trim();
  const all=CONSOLE_MAP.map(e=>({...e,category:idToGroup.get(e.id)}))
    .filter(e=>(!category||e.category===category)&&
      (!q||[e.id,e.title,...e.keywords].some(t=>t.toLowerCase().includes(q))));
  const categories=CONSOLE_REVIEW_CATEGORIES.map(c=>({
    category:c,count:CONSOLE_MAP.filter(e=>idToGroup.get(e.id)===c).length
  }));
  const statuses=all.map(e=>verifyStatus(e.id));
  const count=(status)=>statuses.filter(s=>s.state===status).length;
  const start=(page-1)*pageSize;
  const items=all.slice(start,start+pageSize).map(e=>{
    const status=verifyStatus(e.id);
    return {
      id:e.id,category:e.category,setting:e.title,url:e.link||'https://admin.google.com',
      steps:e.path.map((p,i)=>({n:i+1,action:'Navigate to',target:p})),
      expected:'Inspect this setting in Google Admin console. No current policy value has been checked.',
      ...(e.note?{note:e.note}:{}),
      verification:status
    };
  });
  return {
    review:true,mode:'manual_admin_console_review',
    totalMapped:CONSOLE_MAP.length,totalMatching:all.length,
    page,pageSize,nextPage:start+pageSize<all.length?page+1:null,
    categories,summary:{
      readbackAvailable:count('readback_available'),
      outsideScope:count('outside_scope'),
      manualOnly:count('manual_only')
    },
    items,
    note:'This is a guidance checklist only. No Admin policy was checked or changed. Optional readback tools observe limited data, not proof that an inherited or organization-wide policy is applied.'
  };
}
