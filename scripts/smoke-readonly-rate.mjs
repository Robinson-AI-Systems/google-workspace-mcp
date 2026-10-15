// Shared opt-in TEST runner pacing. The RTC pass rate-limit is shared across
// Vercel instances, so the full catalog cannot send hundreds of requests in a
// burst. This serializes HTTP requests across baseline, discovery, resources
// and result pages; provider-side 429 responses get at most one bounded retry.
// No write routes use this fetcher.
export function pacedReadOnlyFetch(fetcher,{intervalMs=1150,clock=()=>Date.now(),
 sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms))}={}) {
 if(typeof fetcher!=='function'||!Number.isSafeInteger(intervalMs)||intervalMs<1)
  throw Error('invalid_read_only_pacing');
 let nextAt=0;
 let previous=Promise.resolve();
 const request=(url,options={})=>{
  const scheduled=previous.then(async()=>{
   const delay=Math.max(0,nextAt-clock());
   if(delay)await sleep(delay);
   nextAt=Math.max(nextAt,clock())+intervalMs;
   let response=await fetcher(url,options);
   if(response?.status===429){
    const raw=response.headers?.get?.('retry-after');
    const retry=Number(raw);
    const delayMs=raw!==undefined&&raw!==null&&raw!==''&&
     Number.isFinite(retry)&&retry>=0&&retry<=60
     ?Math.max(1000,Math.ceil(retry*1000)):60000;
    await sleep(delayMs);
    nextAt=Math.max(nextAt,clock()+intervalMs);
    response=await fetcher(url,options);
   }
   return response;
  });
  previous=scheduled.then(()=>{},()=>{});
  return scheduled;
 };
 return request;
}
