export default function handler(req, res) {
  const base = (process.env.PUBLIC_BASE_URL || `https://${req.headers.host}`).replace(/\/$/, '');
  res.status(200).json({
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256', 'plain'],
    token_endpoint_auth_methods_supported: ['client_secret_post', 'none']
  });
}
