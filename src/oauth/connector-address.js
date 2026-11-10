// Named connector addresses (2026-11-09). Some apps (Claude) allow only one
// connector per web address, so one person cannot add a second Workspace
// connector, for example one per Google account. Each connector may use its
// own address on the same server: /api/mcp/<name>, e.g. /api/mcp/work.
// The name is only a label: every address reaches the same server and the
// same rules. Sign-in binds a connection to its exact address (RFC 8707
// resource), and a name in the path is the standard form for that (no query).
import {publicResource} from '../principals/security.js';

export const CONNECTOR_NAME=/^[a-z0-9][a-z0-9-]{0,30}$/;
export const validConnectorName=name=>typeof name==='string'&&CONNECTOR_NAME.test(name);
export const mcpResource=(name=null)=>publicResource()+'/api/mcp'+(name?'/'+name:'');
// The resource a request asked for, if it is this server's: the plain
// address, or a named one. An omitted resource is the plain address (MC-4).
export function acceptedResource(value){
 const plain=mcpResource();
 if(value===undefined||value===null||value==='')return plain;
 if(value===plain)return plain;
 if(typeof value!=='string'||!value.startsWith(plain+'/'))return null;
 const name=value.slice(plain.length+1);
 return validConnectorName(name)?value:null;
}
export const connectorNameFrom=req=>validConnectorName(req?.query?.connector)?req.query.connector:null;
