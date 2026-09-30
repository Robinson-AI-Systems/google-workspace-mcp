// Setup route: visit this in a browser, signed into Google as the mailbox
// you want this server to be able to act as, and approve access.
//
//   /api/google/authorize                          -> Google's account chooser
//   /api/google/authorize?account=ops@example.com  -> pre-selects that mailbox
//   ...&label=Appliance%20Rentals                  -> a friendly name to show in lists
//
// You can do this once per mailbox; each one becomes a separate account the
// connector login page can offer. Signing in again as an existing account
// simply refreshes its tokens.
import { getGoogleAuthUrl } from '../../src/auth/google-auth-hosted.js';

export default function handler(req, res) {
  try {
    const account = typeof req.query.account === 'string' ? req.query.account.trim() : '';
    const label = typeof req.query.label === 'string' ? req.query.label.trim().slice(0, 80) : '';
    // The label travels through Google's `state` so the callback can file it.
    const state = new URLSearchParams({ setup: '1', label }).toString();
    const url = getGoogleAuthUrl(state, account || undefined);
    res.writeHead(302, { Location: url });
    res.end();
  } catch (err) {
    res.status(500).send(`Setup error: ${err.message}`);
  }
}
