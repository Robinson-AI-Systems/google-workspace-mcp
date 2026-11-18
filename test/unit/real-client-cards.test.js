// Real client ID cards, copied from the live documents on 2026-11-10. Both
// Claude and ChatGPT must be accepted as public clients; cards that offer
// only key- or secret-based sign-in stay refused.
import { describe, it, expect, beforeEach } from 'vitest';
import { resolveCimdClient, clearCimdCache, cardAllowsPublicClient } from '../../src/oauth/cimd.js';

const publicLookup = async () => ['93.184.216.34'];
const fetchDoc = (doc) => async () => ({
  ok: true, status: 200, headers: { get: () => null }, text: async () => JSON.stringify(doc)
});
const CHATGPT = 'https://chatgpt.com/oauth/client.json';
const chatgptCard = {
  client_id: CHATGPT, client_uri: 'https://chatgpt.com/',
  redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect'],
  token_endpoint_auth_method: 'private_key_jwt',
  token_endpoint_auth_methods_supported: ['none', 'private_key_jwt'],
  grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'],
  response_types: ['code'], client_name: 'ChatGPT',
  logo_uri: 'https://persistent.oaistatic.com/sonic/misc/openai-logo.png',
  token_endpoint_auth_signing_alg: 'RS256', jwks_uri: 'https://chatgpt.com/oauth/jwks.json'
};
const CLAUDE = 'https://claude.ai/oauth/mcp-oauth-client-metadata';
const claudeCard = {
  client_id: CLAUDE, client_name: 'Claude', client_uri: 'https://claude.ai',
  redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
  grant_types: ['authorization_code', 'refresh_token', 'urn:ietf:params:oauth:grant-type:jwt-bearer'],
  response_types: ['code'], token_endpoint_auth_method: 'none'
};
const read = (id, doc) => resolveCimdClient(id, { fetchImpl: fetchDoc(doc), lookupImpl: publicLookup });

describe('real client ID cards', () => {
  beforeEach(() => clearCimdCache());

  it("accepts ChatGPT's card (private_key_jwt preferred, none also offered) as a public client", async () => {
    const client = await read(CHATGPT, chatgptCard);
    expect(client).toMatchObject({
      client_id: CHATGPT, client_name: 'ChatGPT', token_endpoint_auth_method: 'none',
      client_secret_hash: null, cimd: true,
      redirect_uris: ['https://chatgpt.com/connector_platform_oauth_redirect']
    });
  });

  it("accepts Claude's card with its extra grant type", async () => {
    const client = await read(CLAUDE, claudeCard);
    expect(client).toMatchObject({ client_id: CLAUDE, client_name: 'Claude', token_endpoint_auth_method: 'none' });
  });

  it('still refuses cards that cannot sign in as a public client', async () => {
    const refused = [
      { ...chatgptCard, token_endpoint_auth_methods_supported: ['private_key_jwt'] },
      { ...chatgptCard, token_endpoint_auth_methods_supported: undefined },
      { ...chatgptCard, token_endpoint_auth_methods_supported: 'none' },
      { ...chatgptCard, token_endpoint_auth_method: 'client_secret_post', token_endpoint_auth_methods_supported: ['none', 'client_secret_post'] },
      { ...chatgptCard, token_endpoint_auth_method: 'client_secret_basic', token_endpoint_auth_methods_supported: ['none'] },
      { ...chatgptCard, client_secret: 'x' },
      { ...chatgptCard, grant_types: ['refresh_token'] },
      { ...chatgptCard, grant_types: ['authorization_code', 7] }
    ];
    for (const doc of refused) {
      clearCimdCache();
      expect(await read(CHATGPT, doc), JSON.stringify(doc)).toBeNull();
    }
  });

  it('cardAllowsPublicClient treats a missing method as none', () => {
    expect(cardAllowsPublicClient({})).toBe(true);
    expect(cardAllowsPublicClient({ token_endpoint_auth_method: 'private_key_jwt' })).toBe(false);
  });
});
