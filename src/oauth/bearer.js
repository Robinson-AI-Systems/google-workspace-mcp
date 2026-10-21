// RFC9110 authentication scheme names are case insensitive. Token bytes are not.
// One parser for direct MCP and RTC; principal/pass validation remains in each door.
export function readBearer(authorization){
 if(typeof authorization!=='string'||/[\r\n]/.test(authorization))return null;
 return /^[Bb][Ee][Aa][Rr][Ee][Rr][ \t]+([A-Za-z0-9._~+/-]+=*)$/.exec(authorization)?.[1]??null;
}
