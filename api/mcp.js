import {readBearer} from '../src/oauth/bearer.js';
// The actual MCP endpoint Claude talks to. A fresh Server + transport is built
// for each HTTP request, but Vercel can reuse a warm function instance. Expensive
// one-time initialization is therefore cached after it succeeds (see src/once.js).
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { PRODUCT_DISPLAY_NAME, MCP_TECHNICAL_NAME } from '../src/branding.js';
import { serverRelease } from '../src/release.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { registry } from '../src/tools/index.js';
import { errorResult } from '../src/tools/util.js';
import { buildHostedApiClients, ensureMigrated } from '../src/auth/google-auth-hosted.js';
import { getAccessToken, initSchema, touchAccessToken, connectionId, getAllowedDomains, listGoogleAccounts } from '../src/db.js';
import { ACCOUNT_PROPERTY, takeAccount, matchLinkedAccount, onlyThisAccount } from '../src/tools/account-choice.js';
import { onceSuccessful } from '../src/once.js';
import { listedTools, allowedTool, toolMetadata } from '../src/rtc/catalog.js';
import {readPrincipalAccess,legacyOwnerContext} from '../src/principals/store.js';
import {scopedStore} from '../src/principals/store.js';
import {buildPrincipalApiClients} from '../src/principals/clients.js';
import {publicMode} from '../src/principals/security.js';

export const config = { api: { bodyParser: true } };

// OAuth discovery must advertise only the owner-configured service identity.
// An unauthenticated Host/X-Forwarded-Host header is attacker controlled and
// cannot be allowed to turn this standalone MCP into a metadata phishing hint.
export function trustedMcpOrigin(value=process.env.PUBLIC_BASE_URL){
 if(typeof value!=='string')return null;
 try{
  const u=new URL(value);
  return u.protocol==='https:'&&!u.username&&!u.password&&!u.search&&!u.hash&&
    u.pathname==='/'&&!u.port&&u.hostname?u.origin:null;
 }catch{return null;}
}

// DDL and the legacy-account migration do not need to run on every request in
// the same warm function instance. A failure clears the cache so the next
// request retries instead of leaving the instance permanently broken.
const ensureSchemaReady = onceSuccessful(initSchema);
const ensureLegacyMigration = onceSuccessful(ensureMigrated);

// One connection can work with every Google account its owner has linked:
// any tool call may name an `account` (email or label). Leaving it out uses
// the connection's own account, exactly as before. Owner connections switch
// among the owner's linked accounts; public connections stay on their one
// account until per-account isolation for public sign-in is built.
function buildServer(googleAccount, connection, settings, makeClients=null, {multiAccount=false, actingAs=null}={}) {
  const server = new Server(
    { name: MCP_TECHNICAL_NAME, title: PRODUCT_DISPLAY_NAME, version: serverRelease().version },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: listedTools(registry.tools, settings).map(t=>{
    const meta=toolMetadata(t,settings);
    // The compact listing has a strict size budget: there the choice is shown
    // on workspace_call / workspace_batch only. Full listings show it everywhere.
    if(!multiAccount||settings?.listing==='compact'||!meta.inputSchema||meta.inputSchema.properties?.account)return meta;
    return {...meta,inputSchema:{...meta.inputSchema,properties:{...(meta.inputSchema.properties||{}),account:ACCOUNT_PROPERTY}}};
  }) }));

  async function clientsFor(account){
    let clients;
    if(account===undefined){
      clients=makeClients ? await makeClients() : await buildHostedApiClients(googleAccount);
    }else if(multiAccount){
      const email=matchLinkedAccount(account,await listGoogleAccounts());
      clients=await buildHostedApiClients(email);
    }else{
      clients=makeClients ? await makeClients() : await buildHostedApiClients(googleAccount);
      onlyThisAccount(account,clients.actingAs||actingAs);
    }
    // No owner credential or global default is reachable from the public
    // branch: all scoped clients must be built with a server-minted context.
    clients.rtcPolicy=settings;
    clients.connection=connection;
    if(!makeClients)clients.allowedDomains=await getAllowedDomains(clients.actingAs);
    clients.forAccount=next=>next===undefined||next===null||next===''?Promise.resolve(clients):clientsFor(next);
    return clients;
  }

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    const toolHandler = allowedTool(name, settings) && registry.handlers[name];
    if (!toolHandler) {
      return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    }
    try {
      const {account,rest}=takeAccount(args||{});
      const clients=await clientsFor(account);
      return await toolHandler(rest, clients);
    } catch (err) {
      return errorResult(err);
    }
  });

  return server;
}

// P10 acceptance runner is intentionally not connected to the HTTP entrypoint.
// It allows the exact SDK registry to be tested using real disposable
// principal contexts before anyone can enable the separately approved pilot.
export {buildServer as _buildServerForTest};
export function createIsolatedPrincipalServer(context){
 scopedStore(context); // trusted mint check, not a caller assertion
 const settings=Object.freeze({principalKind:'user',profile:context.profile,
  listing:context.listing,areas:context.areas,mode:context.mode,
  cost_policy:context.costPolicy});
 return buildServer(null,context.connectionId,settings,()=>buildPrincipalApiClients(context),{actingAs:context.actingAs});
}

export function publicToolDispatchReady(env=process.env){
  try{
    return publicMode(env)!=='off'&&env.PUBLIC_P10_TOOL_EXECUTION_VERIFIED==='true';
  }catch{return false;}
}
export default async function handler(req, res) {
  await ensureSchemaReady();

  const authHeader = req.headers['authorization'] || '';
  const token = readBearer(authHeader);
  const base = trustedMcpOrigin();

  if (!token) {
    if(base)res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    res.status(401).json({ error: 'unauthorized', error_description: 'Missing bearer token.' });
    return;
  }

  // P10-B can issue individual credentials but MUST NOT execute public tools
  // before P10-4 verifies EVERY provider/storage/guard caller. No owner fallback.
  if(token.startsWith('p10a_')){
    const user=await readPrincipalAccess(token);
    if(!user){
      if(base)res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
      res.status(401).json({error:'invalid_token'});return;
    }
    // Strict rollout: source isolation and owner-authorized pilot must BOTH
    // be explicitly enabled. Merely configuring Google login is not an
    // approval to execute customer tools, nor may an HTTP argument override it.
    if(!publicToolDispatchReady()){
      res.status(403).json({error:'public_dispatch_not_enabled',
        error_description:'Public tool execution requires independently verified P10 tenant isolation and an authorized pilot.'});return;
    }
    const server=createIsolatedPrincipalServer(user);
    const transport=new StreamableHTTPServerTransport({sessionIdGenerator:undefined});
    res.on('close',()=>{transport.close();server.close();});
    await server.connect(transport);
    await transport.handleRequest(req,res,req.body);
    return;
  }
  if(token.startsWith('p10')){
    res.status(401).json({error:'invalid_token'});return;
  }
  const tokenRecord = await getAccessToken(token);
  if (!tokenRecord) {
    if(base)res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
    res.status(401).json({ error: 'invalid_token' });
    return;
  }

  // Only a real persisted legacy bearer selects the one explicit owner
  // principal. No cookie, URL, email suffix or supplied account id can do so.
  const ownerContext=await legacyOwnerContext(token);
  if(!ownerContext){res.status(401).json({error:'invalid_token'});return;}

  // Upgrade older deployments (one shared Google login) in place, once per
  // warm instance. The migration itself remains idempotent for cold starts.
  await ensureLegacyMigration();

  // Every tool call on this connection acts as the Google account chosen at
  // login time (NULL = the server's default account, for older connections).
  try { await touchAccessToken(token); } catch { /* "last used" is informational; never fail a request over it */ }
  const server = buildServer(tokenRecord.google_account || undefined, `${String(tokenRecord.client_id).slice(0, 12)}/${connectionId(token)}`, tokenRecord, null, {multiAccount:true});
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
