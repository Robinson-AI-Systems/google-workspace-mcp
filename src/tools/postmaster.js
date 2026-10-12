// Postmaster v1 is explicitly read-only. Google domain verification and access
// are enforced by the provider, and each domain-specific call also passes the
// server's existing business-domain guard. Do not add the v2 write scopes.
import { ok } from './util.js';

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
function checkedError(error, domain) {
  if ([403,404].includes(Number(error?.code||error?.response?.status)) && domain)
    throw new Error('Postmaster statistics for '+domain+' are unavailable. Verify this domain in Gmail Postmaster Tools, confirm your account has access and reconnect with the approved postmaster.readonly permission. Google detail: '+String(error.message||'permission denied'));
  throw error;
}
const PAGE = { pageSize: { type:'integer', minimum:1, maximum:200, default:100 },pageToken:{type:'string'} };
export const tools=[
 { name:'postmaster_list_domains',description:'List domains visible to this signed-in Google Postmaster Tools account (read-only). Missing domains must be verified in Postmaster Tools first; some metrics need enough sending volume.',inputSchema:{type:'object',properties:{...PAGE}} },
 { name:'postmaster_list_traffic_stats',description:'Read Gmail Postmaster spam rates, authentication ratios, domain reputation and delivery errors for a verified domain and date window. Read-only; requires Postmaster account access and the newly approved postmaster.readonly OAuth grant.',inputSchema:{type:'object',properties:{domain:{type:'string',description:'A domain already verified in Gmail Postmaster Tools'},startDate:{type:'string',description:'YYYY-MM-DD, inclusive'},endDate:{type:'string',description:'YYYY-MM-DD, inclusive'},...PAGE},required:['domain','startDate','endDate']} }
];
export const handlers={
 async postmaster_list_domains(args={},clients){
   const query=page(args); const response=await clients.postmaster.domains.list(query);
   const items=response.data?.domains||[];
   // The page can contain domains for more than one business. Filter rather
   // than returning an unrestricted provider-wide list to scoped connections.
   const allowed=clients.allowedDomains;
   return ok({domains:Array.isArray(allowed)?items.filter(x=>allowed.includes(String(x.name||'').replace(/^domains\//,'').toLowerCase())):items,
     ...(response.data?.nextPageToken?{nextPageToken:response.data.nextPageToken}:{}),
     ...(Array.isArray(allowed)?{scopeFiltered:true}:{})});
 },
 async postmaster_list_traffic_stats(args={},clients){
   const domain=domainName(args.domain),start=day(args.startDate),end=day(args.endDate);
   const from=Date.parse(args.startDate+'T00:00:00Z'),to=Date.parse(args.endDate+'T00:00:00Z');
   if(to<from||to-from>93*86400000) throw new Error('Choose an ordered date range of at most 93 days.');
   const query={parent:'domains/'+domain,...page(args),'startDate.year':start.year,'startDate.month':start.month,'startDate.day':start.day,'endDate.year':end.year,'endDate.month':end.month,'endDate.day':end.day};
   try{
     const response=await clients.postmaster.domains.trafficStats.list(query);
     return ok({domain,stats:response.data?.trafficStats||[],...(response.data?.nextPageToken?{nextPageToken:response.data.nextPageToken}:{})});
   }catch(e){checkedError(e,domain);}
 }
};
