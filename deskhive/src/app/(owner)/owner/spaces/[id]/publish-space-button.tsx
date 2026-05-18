'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { publishSpaceAction } from '@/actions/space';
import { toastError, toastSuccess } from '@/lib/toast';

// Story 9-2b: Publish CTA for a DRAFT space. Sits on the detail page only
// (BA Decision §3 — no per-row Publish on the list, single surface for
// gating evolution). `canPublish` is computed server-side in the parent
// from the owner's `stripe_connect_accounts` row; when false, the button
// is disabled with a tooltip + an adjacent link to /owner/settings.
//
// Mirrors OnboardingCtaButton's useTransition pattern from Story 9-2.
// On success: success toast + router.refresh() to re-render with the new
// PUBLISHED status (the badge + button disappear; the space starts
// appearing in the public listing).
export function PublishSpaceButton({
  spaceId,
  canPublish,
}: {
  spaceId: string;
  canPublish: boolean;
}) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function onClick() {
    if (isPending || !canPublish) return;
    startTransition(async () => {
      const result = await publishSpaceAction({ spaceId });
      if (result.ok) {
        toastSuccess('Space published', {
          description: "It's now visible on DeskHive.",
        });
        router.refresh();
        return;
      }
      if (result.error === 'STRIPE_NOT_ACTIVE') {
        toastError(
          'Complete Stripe onboarding before publishing',
          'Finish onboarding in Settings, then try again.',
        );
        return;
      }
      if (result.error === 'ALREADY_PUBLISHED') {
        // Edge case: another tab published the space first. Refresh to
        // re-render with the latest state rather than surfacing an error.
        router.refresh();
        return;
      }
      toastError('Could not publish space', result.error);
    });
  }

  if (!canPublish) {
    return (
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled
          title="Complete Stripe onboarding to publish this space."
          aria-disabled="true"
        >
          Publish space
        </button>
        <Link href="/owner/settings" className="link-muted">
          Go to Settings →
        </Link>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="btn btn-primary"
      onClick={onClick}
      disabled={isPending}
      aria-busy={isPending}
    >
      {isPending ? 'Publishing…' : 'Publish space'}
    </button>
  );
}
