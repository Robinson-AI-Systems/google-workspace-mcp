// Client ID metadata documents this server publishes for itself.
//
// Some apps (Muse) ask the person for a "Client ID" and accept the address of
// a client document. This server publishes one for Muse at
// /.well-known/muse-client.json, whose client_id is that same address. Every
// sign-in door (authorize, Google hand-off, token, refresh, revoke) looks the
// client up through getOAuthClient, which recognises that exact address here
// as a built-in public client, so the flow never depends on a database
// registration that could be cleaned up or revoked.
//
// Only this server's own published documents are recognised. Other URLs are
// never fetched, so no outside party can define a client.
import { publicResource } from '../principals/security.js';

export const MUSE_DOCUMENT_PATH = '/.well-known/muse-client.json';
export const MUSE_REDIRECT_URI = 'https://agent.meta.ai/api/hatch/oauth/callback';

export function museClientDocument(base = publicResource()) {
  return {
    client_id: `${base}${MUSE_DOCUMENT_PATH}`,
    client_name: 'Muse',
    grant_types: ['authorization_code', 'refresh_token'],
    redirect_uris: [MUSE_REDIRECT_URI],
    response_types: ['code'],
    token_endpoint_auth_method: 'none'
  };
}

// The built-in client for a document address this server publishes, shaped
// like an oauth_clients row (no secret: a public PKCE client), or null.
export function documentClient(clientId) {
  if (typeof clientId !== 'string' || !clientId.startsWith('https://')) return null;
  let doc;
  try { doc = museClientDocument(publicResource()); } catch { return null; }
  if (clientId !== doc.client_id) return null;
  return { client_id: doc.client_id, client_secret: null, redirect_uris: [...doc.redirect_uris], client_name: doc.client_name };
}

// Muse clients (the seeded 'muse' id or the document address) may omit the
// `resource` parameter; it then means this server's MCP endpoint.
export function isMuseClient(clientId) {
  return clientId === 'muse' || documentClient(clientId) !== null;
}
