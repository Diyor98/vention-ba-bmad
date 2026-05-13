/**
 * Story 8-1: CLI test-send script. Fires the '__test__' template to
 * TEST_EMAIL_RECIPIENT for BA pipeline verification. Internal-only
 * tooling — same posture as scripts/seed.ts (CLI, not a route).
 *
 * Decision §8 + Story 7-PREP-1's no-backdoor-route principle: no
 * /api/test/email endpoint exists. This script is the only way to
 * fire a test email outside the eventual real-template callers in
 * Stories 8-2 / 8-3 / 8-4.
 *
 * Usage:
 *   pnpm send-test-email
 *
 * Requires (in .env.local or environment):
 *   - RESEND_API_KEY (your Resend free-tier key)
 *   - TEST_EMAIL_RECIPIENT (your inbox)
 *   - EMAIL_FROM_ADDRESS (optional; defaults to 'onboarding@resend.dev')
 *   - EMAIL_LOGO_URL (optional; emits <img> when set)
 */

import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { sendEmail } from '@/lib/email';

async function main(): Promise<void> {
  const to = process.env.TEST_EMAIL_RECIPIENT;
  if (!to || to.trim().length === 0) {
    console.error(
      'TEST_EMAIL_RECIPIENT is not set. Add it to .env.local (e.g. TEST_EMAIL_RECIPIENT=you@example.com) and re-run.',
    );
    process.exit(1);
  }

  console.log(`Sending test email to ${to} …`);
  const result = await sendEmail({
    to,
    template: '__test__',
    data: { message: 'Hello from Story 8-1!' },
  });

  if (result.status === 'sent') {
    console.log('✓ Email sent successfully. Check your inbox in ~30 seconds.');
    process.exit(0);
  }
  if (result.status === 'disabled') {
    console.log(
      "ℹ Template '__test__' is disabled via EMAIL_TEMPLATES_DISABLED. No email was sent.",
    );
    console.log(
      '  Remove the kill-switch entry to actually send, or note that the disabled path is working as designed.',
    );
    process.exit(0);
  }
  console.error(`✗ Email send failed: ${result.error}`);
  process.exit(1);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`Unexpected error in send-test-email script: ${msg}`);
  process.exit(1);
});
