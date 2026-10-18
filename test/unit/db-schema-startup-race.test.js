import {describe,it,expect,beforeAll,afterAll,beforeEach,vi} from 'vitest';

// Fail only the exact additive DDL operation: caller-owned writes and Google
// requests are outside this retry boundary. No production DB is contacted.
const fake=vi.hoisted(()=>({
  statements:[],collisionCount:0,code:null,constraint:null,at:'google_auth',wrapped:false
}));
vi.mock('@neondatabase/serverless',()=>({
  neon:()=>async(parts,...values)=>{
    const statement=parts.join('?');
    fake.statements.push(statement);
    if(fake.collisionCount>0&&new RegExp('CREATE TABLE IF NOT EXISTS '+fake.at+'\\\\b').test(statement)){
      fake.collisionCount--;
      const inner=Object.assign(new Error('sanitized database failure'),
        {code:fake.code,constraint:fake.constraint});
      if(fake.wrapped)throw Object.assign(new Error('wrapped NeonDbError'),{sourceError:inner});
      throw inner;
    }
    return [];
  }
}));
import {initSchema} from '../../src/db.js';

const starts=()=>fake.statements.filter(s=>/CREATE TABLE IF NOT EXISTS google_auth\b/.test(s)).length;
let oldUrl;
beforeAll(()=>{
  oldUrl=process.env.DATABASE_URL;
  process.env.DATABASE_URL='postgres://unused.invalid:5432/test';
});
afterAll(()=>{
  if(oldUrl===undefined)delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL=oldUrl;
});
beforeEach(()=>{
  fake.statements=[];
  fake.collisionCount=0;
  fake.code=null;
  fake.constraint=null;
  fake.at='google_auth';
  fake.wrapped=false;
});
describe('serverless concurrent schema initialization recovery',()=>{
  it('retries the observed pg_type catalog-key collision, without skipping later schema steps',async()=>{
    fake.collisionCount=1;
    fake.code='23505';
    fake.constraint='pg_type_typname_nsp_index';
    await initSchema();
    expect(starts()).toBe(2);
    expect(fake.statements.some(s=>s.includes('CREATE TABLE IF NOT EXISTS principal_connections'))).toBe(true);
  });

  it('coalesces overlapping calls within one serverless process and permits a later independent run',async()=>{
    await Promise.all(Array.from({length:7},()=>initSchema()));
    expect(starts()).toBe(1);
    await initSchema();
    expect(starts()).toBe(2);
  });

  it('replays the whole additive setup after a late duplicate-table failure',async()=>{
    fake.collisionCount=1;
    fake.code='42P07';
    fake.at='google_token_storage';
    await initSchema();
    expect(starts()).toBe(2);
    expect(fake.statements.filter(s=>s.includes('INSERT INTO google_token_storage'))).toHaveLength(1);
  });

  it('handles a wrapped transient catalog failure at the V2 principal creation boundary',async()=>{
    fake.collisionCount=1;
    fake.code='23505';
    fake.constraint='pg_class_relname_nsp_index';
    fake.at='principals';
    fake.wrapped=true;
    await initSchema();
    expect(starts()).toBe(2);
  });

  it('bounds repeated race failures and clears the rejected in-flight initialization',async()=>{
    fake.collisionCount=6;
    fake.code='23505';
    fake.constraint='pg_type_typname_nsp_index';
    await expect(initSchema()).rejects.toMatchObject({code:'23505'});
    expect(starts()).toBe(5);
    fake.collisionCount=0;
    await initSchema();
    expect(starts()).toBe(6);
  });

  it('never retries a normal user-data unique violation or unrelated SQL exception',async()=>{
    fake.collisionCount=1;
    fake.code='23505';
    fake.constraint='principal_google_identities_pkey';
    await expect(initSchema()).rejects.toMatchObject({constraint:'principal_google_identities_pkey'});
    expect(starts()).toBe(1);
    fake.collisionCount=1;
    fake.code='42501';
    fake.constraint=null;
    await expect(initSchema()).rejects.toMatchObject({code:'42501'});
    expect(starts()).toBe(2);
  });
});
