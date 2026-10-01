import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const saved = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
beforeEach(() => { delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; });
afterEach(() => { if (saved === undefined) delete process.env.GOOGLE_SERVICE_ACCOUNT_JSON; else process.env.GOOGLE_SERVICE_ACCOUNT_JSON = saved; });

describe('workflow_brand_mailbox without a robot key', () => {
  it('does nothing and says delegation is not set up', async () => {
    const { handlers } = await import('../../src/tools/mailbox-branding.js');
    const result = await handlers.workflow_brand_mailbox({ userEmail: 'sam@example.test', displayName: 'Sam', aliases: [{ email: 'hello@example.test' }] });
    const body = JSON.parse(result.content[0].text);
    expect(body.done).toBe(false);
    expect(body.reason).toMatch(/not set up/i);
  });
});
