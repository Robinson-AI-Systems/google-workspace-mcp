import pg from 'pg';
const schema=process.env.RTC_CONFORMANCE_SCHEMA;
if(!/^rtc_conformance_[a-f0-9]{16}$/.test(schema||''))throw Error('Isolated conformance schema required.');
export const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,max:12,options:'-c search_path='+schema});
export const neon=()=>async(strings,...values)=>{
 let text=strings[0];for(let i=0;i<values.length;i++)text+='$'+(i+1)+strings[i+1];
 return (await pool.query(text,values)).rows;
};
