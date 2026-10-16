// Postmaster exposes only read operations. Provider OAuth scopes are managed
// separately with explicit owner approval; no domain/user writes are exposed.
import { ok } from './util.js';
import { mergePostmasterDays } from '../auth/postmaster-client.js';

function domainName(domain) {
  if (typeof domain !== 'string' || domain.length > 253 || !/^(?:[a-z\d](?:[a-z\d-]{0,61}[a-z\d])?\.)+[a-z]{2,63}$/i.test(domain))
    throw new Error('Use a verified domain such as example.com, without http://, paths or spaces.');
  return domain.toLowerCase();
}
function day(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) throw new Error('Dates must use YYYY-MM-DD.');
  const parsed = new Date(text + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) throw new Error('Invalid calendar date.');
  const [year, month, date] = text.split('-').map(Number);
  return { year, month, day:date };
}
function page(args) {
  const pageSize=args.pageSize===undefined?100:args.pageSize;
  if(!Number.isInteger(pageSize)||pageSize<1||pageSize>200) throw new Error('pageSize must be 1 to 200.');
  if(args.pageToken!==undefined && (typeof args.pageToken!=='string'||!args.pageToken)) throw new Error('Invalid page token.');
  return { pageSize, ...(args.pageToken?{pageToken:args.pageToken}:{}) };
}
// Postmaster reports daily observations, not a traffic-weighted domain-wide rate.
// Absent fields or low-volume days cannot be interpreted as zero spam/errors.
export function summarizePostmasterDays(stats, {complete=true}={}) {
  if(!Array.isArray(stats))throw new Error('Invalid Postmaster daily statistics.');
  const observed={spam:[],spf:[],dkim:[],dmarc:[],delivery:[]},reputations=new Map(),errors=new Map(),dates=new Set();
  for(const daily of stats){
    if(!daily||typeof daily!=='object'||typeof daily.name!=='string'||!/\/trafficStats\/\d{8}$/.test(daily.name))throw new Error('Invalid Postmaster day; no trustworthy summary can be made.');
    const date=daily.name.slice(-8);
    if(dates.has(date))throw new Error('Duplicate Postmaster daily statistics; no trustworthy summary can be made.');
    dates.add(date);
    for(const [key,field] of [['spam','userReportedSpamRatio'],['spf','spfSuccessRatio'],['dkim','dkimSuccessRatio'],['dmarc','dmarcSuccessRatio'],['delivery','deliveryErrorRatio']]){
      const v=daily[field];
      if(v===undefined||v===null)continue;
      if(typeof v!=='number'||!Number.isFinite(v)||v<0||v>1)throw new Error('Invalid Postmaster metric '+field+'.');
      observed[key].push(v);
    }
    if(daily.domainReputation&&daily.domainReputation!=='REPUTATION_CATEGORY_UNSPECIFIED')reputations.set(daily.domainReputation,(reputations.get(daily.domainReputation)||0)+1);
    if(daily.deliveryErrors!==undefined){
      if(!Array.isArray(daily.deliveryErrors))throw new Error('Invalid Postmaster delivery errors.');
      for(const error of daily.deliveryErrors){
        if(!error||typeof error.errorType!=='string')throw new Error('Invalid Postmaster delivery error entry.');
        errors.set(error.errorType,(errors.get(error.errorType)||0)+1);
      }
    }
  }
  const extrema=(values,mode)=>values.length?(mode==='max'?Math.max(...values):Math.min(...values)):null;
  const levels=['BAD','LOW','MEDIUM','HIGH'];
  const worstReputation=levels.find(s=>reputations.has(s))||null;
  const maxSpamRatio=extrema(observed.spam,'max');
  return {observedDays:dates.size,complete,coverage:complete?'Provider pagination ended. Days with low or absent sending volume may be missing.':'The page limit was reached; unread provider pages remain.',
    worstDomainReputation:worstReputation,reputationDays:Object.fromEntries(reputations),
    maxObservedUserReportedSpamRatio:maxSpamRatio,minObservedSpfSuccessRatio:extrema(observed.spf,'min'),
    minObservedDkimSuccessRatio:extrema(observed.dkim,'min'),minObservedDmarcSuccessRatio:extrema(observed.dmarc,'min'),
    deliveryErrorDays:Object.fromEntries(errors),maxObservedDeliveryErrorRatio:extrema(observed.delivery,'max'),
    assessment:worstReputation==='BAD'||worstReputation==='LOW'?'needs_attention':!complete||!stats.length||!worstReputation&&maxSpamRatio===null?'not_readable':'observations_available',
    note:'Only reported Google Postmaster observations; daily ratios are not volume-weighted, and missing fields/days are unknown, not healthy. This is not a guarantee of inbox delivery.'};
}
function checkedError(error, domain) {
  if ([403,404].includes(Number(error?.code||error?.response?.status)) && domain)
    throw new Error('Postmaster statistics for '+domain+' are unavailable. Verify this domain in Gmail Postmaster Tools, confirm your account has access and that the v2 postmaster.traffic.readonly permission was separately approved and granted. Do not repeat consent for the retired v1 postmaster.readonly permission. Google detail: '+String(error.message||'permission denied'));
  throw error;
}
const PAGE = { pageSize: { type:'integer', minimum:1, maximum:200, default:100 },pageToken:{type:'string'} };
export const tools=[
 { name:'postmaster_list_domains',description:'List domains visible to this signed-in Google Postmaster Tools v2 account (read-only tool). Requires separately approved postmaster.domain OAuth permission, which also permits domain management; this tool never modifies domains. Missing domains must be verified in Postmaster Tools first; some metrics need enough sending volume.',inputSchema:{type:'object',properties:{...PAGE}} },
 { name:'postmaster_list_traffic_stats',description:'Read Gmail Postmaster v2 spam rates, authentication ratios and delivery-error rates for a verified domain and date window. Read-only; requires Postmaster account access and the separately approved v2 postmaster.traffic.readonly OAuth grant. Domain reputation is unavailable in v2.',inputSchema:{type:'object',properties:{domain:{type:'string',description:'A domain already verified in Gmail Postmaster Tools'},startDate:{type:'string',description:'YYYY-MM-DD, inclusive'},endDate:{type:'string',description:'YYYY-MM-DD, inclusive'},withSummary:{type:'boolean',description:'Opt in to a read-only, owner-readable range summary. Follows up to maxPages; metrics stay labelled as daily observations.'},maxPages:{type:'integer',minimum:1,maximum:10,description:'Limit for the opt-in summary; default five provider pages.'},...PAGE},required:['domain','startDate','endDate']} }
];
export const handlers={
 async postmaster_list_domains(args={},clients){
   const query=page(args); const response=await clients.postmaster.domains.list(query);
   const items=response.data?.domains||[];
   // The page can contain domains for more than one business. Filter rather
   // than returning an unrestricted provider-wide list to scoped connections.
   const allowed=clients.allowedDomains;
   const visible=Array.isArray(allowed)?items.filter(x=>allowed.includes(String(x.name||'').replace(/^domains\//,'').toLowerCase())):items;
   return ok({domains:visible,count:visible.length,
     ...(response.data?.nextPageToken?{nextPageToken:response.data.nextPageToken}:{}),
     ...(Array.isArray(allowed)?{scopeFiltered:true}:{})});
 },
 async postmaster_list_traffic_stats(args={},clients){
   const domain=domainName(args.domain),start=day(args.startDate),end=day(args.endDate);
   const from=Date.parse(args.startDate+'T00:00:00Z'),to=Date.parse(args.endDate+'T00:00:00Z');
   if(to<from||to-from>93*86400000) throw new Error('Choose an ordered date range of at most 93 days.');
   if(args.withSummary!==undefined&&typeof args.withSummary!=='boolean')throw new Error('withSummary must be true or false.');
   if(args.maxPages!==undefined&&(!Number.isInteger(args.maxPages)||args.maxPages<1||args.maxPages>10))throw new Error('maxPages must be 1 through 10.');
   if(args.maxPages!==undefined&&args.withSummary!==true)throw new Error('maxPages requires withSummary: true.');
   const query={parent:'domains/'+domain,...page(args),'startDate.year':start.year,'startDate.month':start.month,'startDate.day':start.day,'endDate.year':end.year,'endDate.month':end.month,'endDate.day':end.day};
   const summarize=args.withSummary===true,limit=summarize?(args.maxPages??5):1;
   const stats=[],seen=new Set();let token=query.pageToken,nextPageToken=null;
   try{
     for(let index=0;index<limit;index++){
       const response=await clients.postmaster.domains.trafficStats.list({...query,...(token?{pageToken:token}:{})});
       const data=response?.data;
       if(!data||!Array.isArray(data.trafficStats||[]))throw new Error('Google returned malformed Postmaster statistics.');
       stats.push(...(data.trafficStats||[]));
       nextPageToken=data.nextPageToken||null;
       if(!summarize||!nextPageToken)break;
       if(typeof nextPageToken!=='string'||seen.has(nextPageToken)||nextPageToken===token)throw new Error('Google repeated an invalid Postmaster continuation; the report cannot be trusted.');
       seen.add(nextPageToken);token=nextPageToken;
     }
     const daily=clients.postmaster.apiVersion==='v2'?mergePostmasterDays(stats):stats;
     const output={domain,stats:daily,...(nextPageToken?{nextPageToken}:{}),...(clients.postmaster.apiVersion==='v2'?{apiVersion:'v2',note:'Daily v2 metrics normalized into the existing tool shape. Domain/IP reputation is unavailable; missing days or metrics are unknown.'}:{})};
     if(summarize)output.summary=summarizePostmasterDays(daily,{complete:!nextPageToken});
     return ok(output);
   }catch(e){checkedError(e,domain);}
 }
};
