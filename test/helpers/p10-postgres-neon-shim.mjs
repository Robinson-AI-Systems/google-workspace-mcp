// Only loaded by the disposable real-Postgres child worker through a Node
// module resolve hook. There are no provider, production or public calls.
import pg from 'pg';
const schema=process.env.P10_TEST_SCHEMA;
if(!/^[a-z][a-z0-9_]{1,60}$/.test(schema||''))throw Error('invalid_test_schema');
if(!process.env.TEST_DATABASE_URL)throw Error('test_database_not_configured');
const pool=new pg.Pool({connectionString:process.env.TEST_DATABASE_URL,
  max:4,options:'-c search_path='+schema});
export function neon(){
 return async(strings,...values)=>{
   let statement=strings[0];
   for(let i=0;i<values.length;i++)statement+='$'+(i+1)+strings[i+1];
   return (await pool.query(statement,values)).rows;
 };
}
export const close=()=>pool.end();
