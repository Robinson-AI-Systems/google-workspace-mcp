// Protected operator-only P5-2 inspection/activation; never prints credentials.
import { initSchema, inspectGoogleTokenRetirement, activateGoogleTokenRetirement } from '../src/db.js';
const arg = process.argv[2];
if (!['--inspect','--activate'].includes(arg) || process.argv.length !== 3) {
  console.error('Usage: node scripts/google-token-retirement.mjs --inspect|--activate');
  process.exitCode = 2;
} else {
  try {
    await initSchema();
    if (arg === '--inspect') console.log(JSON.stringify(await inspectGoogleTokenRetirement()));
    else {
      // This is NOT a substitute for external owner authorization. The operator
      // must independently confirm release ancestry, rollback plan, account
      // refresh/backfill and the original November 1 date requirement first.
      if (process.env.GWS_TOKEN_RETIREMENT_OWNER_CONFIRMED !== 'true')
        throw Error('Owner-confirmed protected maintenance environment required.');
      console.log(JSON.stringify(await activateGoogleTokenRetirement({ ownerConfirmed: true })));
    }
  } catch (error) {
    console.error('Token retirement refused:', error.message);
    process.exitCode = 1;
  }
}
