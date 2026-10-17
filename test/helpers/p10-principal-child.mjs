// P10-4: actual second process must execute production scopedStore against
// the SAME disposable Postgres, not a fake DB fixture or pure schema peek.
import {registerHooks} from 'node:module';
const shimUrl=new URL('./p10-postgres-neon-shim.mjs',import.meta.url).href;
registerHooks({resolve(specifier,context,next){
 if(specifier==='@neondatabase/serverless')return {url:shimUrl,shortCircuit:true};
 return next(specifier,context);
}});
const {close}=await import('./p10-postgres-neon-shim.mjs');
try{
 let body='';for await(const chunk of process.stdin)body+=chunk.toString();
 const {accessToken,foreignAccountId,foreignHandle,ownedHandle,window}=JSON.parse(body);
 const {readPrincipalAccess,scopedStore}=await import('../../src/principals/store.js');
 const context=await readPrincipalAccess(accessToken);
 if(!context)throw Error('independent_worker_bearer_rejected');
 const store=scopedStore(context);
 const own=(await store.listAccounts()).some(a=>a.id===context.accountId);
 const foreignAccountMissing=await store.getAccount(foreignAccountId)===null;
 const foreignGrantMissing=await store.getGrant(foreignAccountId)===null;
 const foreignResultMissing=await store.getResult(foreignHandle)===null;
 const resultWritten=(await store.storeResult({handle:ownedHandle,
   payload:{data:{owner:context.principalId},source:'second-process'}}))===ownedHandle;
 const rateAllowed=(await store.chargeRate('second-process',new Date(window),1)).allowed;
 process.stdout.write(JSON.stringify({
   own,foreignAccountMissing,foreignGrantMissing,foreignResultMissing,resultWritten,rateAllowed
 })+'\n');
}finally{await close();}
