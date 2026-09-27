// One-time setup route: visit this in a browser, signed into Google as your
// Workspace admin, to let this server act on your Workspace.
import { getGoogleAuthUrl } from '../../src/auth/google-auth-hosted.js';

export default function handler(req, res) {
  try {
    const url = getGoogleAuthUrl('setup');
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err) {
    res.status(500).send(`Setup error: ${err.message}`);
  }
}
