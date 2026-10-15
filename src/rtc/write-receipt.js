// RTC §8 needs a real service-owned audit row reference. Legacy MCP keeps its
// boolean logged field; the HTTPS wire exposes the receipt without inventing IDs.
const id = value => Number.isSafeInteger(value) && value > 0;
export function rtcWriteReceipt(value) {
 if(!value||typeof value!=='object'||Array.isArray(value)||
    typeof value.done!=='boolean'&&typeof value.handle!=='string'||value.logged!==true)return value;
 if(!id(value.changeId))return {...value,logged:false,confirmed:value.confirmed===true?false:value.confirmed,
   auditFailure:true,warning:'The change has no usable audit reference; verify it before retrying.'};
 return {...value,logged:{id:value.changeId}};
}
export function rtcReceiptSchema(schema) {
 if(!schema||typeof schema!=='object')return schema;
 const copy=structuredClone(schema);
 const visit=value=>{
  if(!value||typeof value!=='object')return;
  if(value.properties?.logged?.type==='boolean')value.properties.logged={oneOf:[
    {const:false},{type:'object',properties:{id:{type:'integer',minimum:1}},required:['id'],additionalProperties:false}
  ]};
  Object.values(value).forEach(visit);
 };
 visit(copy);return copy;
}
