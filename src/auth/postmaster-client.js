// The pinned googleapis release predates Postmaster v2. Expose only the two
// approved read operations through documented v2 endpoints; never domain/user writes.
// v2 returns one metric per row, so normalize it into the existing daily tool shape.
const BASE = 'https://gmailpostmastertools.googleapis.com/v2';
const METRICS = [
  ['userReportedSpamRatio', 'SPAM_RATE'],
  ['spfSuccessRatio', 'AUTH_SUCCESS_RATE', 'auth_type = "spf"'],
  ['dkimSuccessRatio', 'AUTH_SUCCESS_RATE', 'auth_type = "dkim"'],
  ['dmarcSuccessRatio', 'AUTH_SUCCESS_RATE', 'auth_type = "dmarc"'],
  ['deliveryErrorRatio', 'DELIVERY_ERROR_RATE']
];
const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);
function cursor(data) {
  if (data.nextPageToken !== undefined && typeof data.nextPageToken !== 'string')
    throw Error('Invalid Postmaster continuation.');
  return data.nextPageToken ? {nextPageToken:data.nextPageToken} : {};
}
function checkedPage(pageSize, pageToken) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 200 ||
      pageToken !== undefined && (typeof pageToken !== 'string' || !pageToken))
    throw Error('Invalid Postmaster pagination.');
  return {pageSize, ...(pageToken ? {pageToken} : {})};
}
function checkedDate(year, month, day) {
  if (![year, month, day].every(Number.isInteger) || year < 1 || year > 9999) throw Error('Invalid Postmaster date.');
  const text = `${String(year).padStart(4,'0')}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  const stamp = Date.parse(text + 'T00:00:00Z');
  if (!Number.isFinite(stamp) || new Date(stamp).toISOString().slice(0,10) !== text) throw Error('Invalid Postmaster date.');
  return {year, month, day};
}
export function mergePostmasterDays(rows) {
  const byDay = new Map();
  for (const row of rows) {
    const current = byDay.get(row.name) || {name:row.name};
    for (const [key, value] of Object.entries(row)) {
      if (key === 'name') continue;
      if (Object.hasOwn(current,key)) throw Error('Duplicate Postmaster metric for a day.');
      current[key] = value;
    }
    byDay.set(row.name,current);
  }
  return [...byDay.values()];
}
export function buildPostmasterClient(auth) {
  return {apiVersion:'v2', domains:{
    async list({pageSize=100,pageToken}={}) {
      const response = await auth.request({url:BASE+'/domains',method:'GET',params:checkedPage(pageSize,pageToken)});
      const data = response?.data;
      if (!isObject(data) || data.domains !== undefined && !Array.isArray(data.domains)) throw Error('Invalid Postmaster domain page.');
      const domains = data.domains || [];
      if (domains.some(d => !isObject(d) || typeof d.name !== 'string' || !/^domains\/[a-z\d.-]+$/i.test(d.name)))
        throw Error('Invalid Postmaster domain identity.');
      return {data:{domains,...cursor(data)}};
    },
    trafficStats:{async list(query={}) {
      const {parent,pageSize=100,pageToken} = query;
      if (typeof parent !== 'string' || !/^domains\/(?:[a-z\d](?:[a-z\d-]*[a-z\d])?\.)+[a-z]{2,63}$/i.test(parent))
        throw Error('Invalid Postmaster parent.');
      const start=checkedDate(query['startDate.year'],query['startDate.month'],query['startDate.day']);
      const end=checkedDate(query['endDate.year'],query['endDate.month'],query['endDate.day']);
      const stamp=d=>Date.parse(`${String(d.year).padStart(4,'0')}-${String(d.month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}T00:00:00Z`);
      if (stamp(end)<stamp(start) || stamp(end)-stamp(start)>93*86400000) throw Error('Invalid Postmaster range.');
      const response = await auth.request({url:`${BASE}/${parent}/domainStats:query`,method:'POST',data:{
        ...checkedPage(pageSize,pageToken),aggregationGranularity:'DAILY',
        timeQuery:{dateRanges:{dateRanges:[{start,end}]}},
        metricDefinitions:METRICS.map(([name,standardMetric,filter])=>({name,baseMetric:{standardMetric},...(filter?{filter}:{})}))
      }});
      const data=response?.data;
      if (!isObject(data) || data.domainStats !== undefined && !Array.isArray(data.domainStats)) throw Error('Invalid Postmaster statistics page.');
      const rows=(data.domainStats || []).map(row=>{
        if (!isObject(row) || typeof row.name !== 'string' || !row.name.startsWith(parent+'/domainStats/') ||
            !row.name.slice((parent+'/domainStats/').length) || !METRICS.some(([name])=>name===row.metric) || !isObject(row.date) || !isObject(row.value))
          throw Error('Invalid Postmaster metric identity.');
        const date=checkedDate(row.date.year,row.date.month,row.date.day);
        if (stamp(date)<stamp(start) || stamp(date)>stamp(end)) throw Error('Postmaster day outside requested range.');
        const values=Object.keys(row.value);
        if (values.length!==1 || !['doubleValue','floatValue'].includes(values[0])) throw Error('Invalid Postmaster metric value.');
        const value=row.value[values[0]];
        if (typeof value!=='number' || !Number.isFinite(value) || value<0 || value>1) throw Error('Invalid Postmaster ratio.');
        const dateId=`${String(date.year).padStart(4,'0')}${String(date.month).padStart(2,'0')}${String(date.day).padStart(2,'0')}`;
        return {name:parent+'/trafficStats/'+dateId,[row.metric]:value};
      });
      return {data:{trafficStats:mergePostmasterDays(rows),...cursor(data)}};
    }}
  }};
}
