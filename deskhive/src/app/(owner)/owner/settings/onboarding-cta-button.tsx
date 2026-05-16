'use client';

import { useState, useTransition } from 'react';
import { initiateConnectOnboardingAction } from '@/actions/connect';
import { toastError } from '@/lib/toast';

/**
 * Story 9-2: Client wrapper for the "Complete onboarding" / "Continue
 * onboarding" CTA. The Server Action returns the Stripe Account Link
 * URL; this component does the `window.location.assign(url)` step
 * because Server Actions can't return external redirects cleanly (BA
 * Decision §4 invariant — Next.js's redirect() only handles internal
 * navigations across the Server Action boundary).
 *
 * On error: surfaces the Stripe-pre-translated error message via toast,
 * leaves the user on the page so they can retry.
 */
export function OnboardingCtaButton({
  label,
  className = 'btn btn-primary',
}: {
  label: string;
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [disabled, setDisabled] = useState(false);

  function onClick() {
    if (isPending || disabled) return;
    startTransition(async () => {
      const result = await initiateConnectOnboardingAction();
      if (!result.ok) {
        toastError('Stripe Connect', result.error);
        return;
      }
      // Disable button so the user doesn't double-click during redirect.
      setDisabled(true);
      window.location.assign(result.redirectUrl);
    });
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={isPending || disabled}
      aria-busy={isPending}
    >
      {isPending ? 'Generating link…' : label}
    </button>
  );
}
