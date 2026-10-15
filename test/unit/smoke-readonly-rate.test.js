import {describe,it,expect} from 'vitest';
import {pacedReadOnlyFetch} from '../../scripts/smoke-readonly-rate.mjs';
describe('P0-2 shared full-catalog TEST request pacing',()=>{
 it('serializes concurrent read requests below the default RTC per-pass budget',async()=>{
  let now=0;const called=[];
  const fetcher=async(_,options)=>{called.push({t:now,method:options.method});return {status:200};};
  const paced=pacedReadOnlyFetch(fetcher,{intervalMs:1150,clock:()=>now,
   sleep:async ms=>{now+=ms;}});
  const result=await Promise.all(Array.from({length:8},()=>paced('https://test.example/api/tools/foo',{method:'POST'})));
  expect(result.every(r=>r.status===200)).toBe(true);
  expect(called).toHaveLength(8);
  expect(called.map(x=>x.t)).toEqual([0,1150,2300,3450,4600,5750,6900,8050]);
 });
 it('respects Retry-After once, never treating repeated 429 as success',async()=>{
  let now=0;const calls=[];
  const paced=pacedReadOnlyFetch(async()=>{calls.push(now);
    return {status:429,headers:{get:()=> '3'}};},
   {clock:()=>now,sleep:async ms=>{now+=ms;}});
  const out=await paced('https://test.example/api/tools/foo');
  expect(out.status).toBe(429);
  expect(calls).toEqual([0,3000]);
 });
 it('continues after a thrown request without dropping or duplicating the next request',async()=>{
  let now=0,count=0;
  const paced=pacedReadOnlyFetch(async()=>{if(++count===1)throw Error('fetch_failed');return {status:200};},
   {clock:()=>now,sleep:async ms=>{now+=ms;}});
  await expect(paced('https://test.example')).rejects.toThrow('fetch_failed');
  await expect(paced('https://test.example')).resolves.toMatchObject({status:200});
  expect(now).toBe(1150);
 });
});
