import { handleGoogleCallback } from '../../src/auth/google-auth-hosted.js';
import { initSchema } from '../../src/db.js';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export default async function handler(req, res) {
  await initSchema();
  const { code, error, state } = req.query;
  if (error) {
    res.status(400).send(`Google returned an error: ${error}`);
    return;
  }
  try {
    const label = state ? new URLSearchParams(String(state)).get('label') || undefined : undefined;
    const email = await handleGoogleCallback(code, { label });
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`<!doctype html><html><body style="font-family:-apple-system,sans-serif;text-align:center;padding:4rem">
      <h2>Connected: ${escapeHtml(email)}</h2>
      <p>This server can now act as that mailbox. You can close this tab.</p>
      <p style="color:#555;font-size:0.9rem">To let a Claude project use it, connect (or reconnect) the connector in that project and pick this account on the login page.</p>
    </body></html>`);
  } catch (err) {
    res.status(500).send(`Failed to complete Google sign-in: ${err.message}`);
  }
}
