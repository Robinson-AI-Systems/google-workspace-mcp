import { handleGoogleCallback } from '../../src/auth/google-auth-hosted.js';
import { initSchema } from '../../src/db.js';

export default async function handler(req, res) {
  await initSchema();
  const { code, error } = req.query;
  if (error) {
    res.status(400).send(`Google returned an error: ${error}`);
    return;
  }
  try {
    await handleGoogleCallback(code);
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`<!doctype html><html><body style="font-family:-apple-system,sans-serif;text-align:center;padding:4rem">
      <h2>Connected to Google Workspace</h2>
      <p>You can close this tab. Your MCP server is ready to use from Claude.</p>
    </body></html>`);
  } catch (err) {
    res.status(500).send(`Failed to complete Google sign-in: ${err.message}`);
  }
}
