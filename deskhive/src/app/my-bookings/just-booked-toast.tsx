'use client';

import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toastSuccess, TOAST_COPY } from '@/lib/toast';

/**
 * Story 9-3: fires the post-Checkout success toast on /my-bookings.
 *
 * The return-from-Stripe-Checkout Server Component redirects here with
 * `?just_booked=1` after marking the booking AUTHORIZED. We can't fire
 * the toast inside the return-URL handler itself — that page is
 * transient (immediate redirect away); a toast there wouldn't be seen.
 *
 * Reuses Story 6-3's `BOOKING_SUCCESS_*` copy verbatim — only the
 * firing context changed. The "View in My Bookings" action button is
 * a soft no-op since the user is already on /my-bookings; clicking it
 * triggers a router refresh, which is a defensible "nothing happens
 * but the page is fresh" affordance for visual consistency with how
 * the action button behaves elsewhere.
 *
 * The useRef guard handles React 19 Strict Mode's effect double-
 * invocation in dev. The toast fires exactly once per page-load with
 * the param present.
 */
export function JustBookedToast() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    if (searchParams.get('just_booked') !== '1') return;
    firedRef.current = true;

    toastSuccess(TOAST_COPY.BOOKING_SUCCESS_TITLE, {
      description: TOAST_COPY.BOOKING_SUCCESS_DESCRIPTION,
      action: {
        label: TOAST_COPY.BOOKING_SUCCESS_ACTION_LABEL,
        onClick: () => router.refresh(),
      },
    });
  }, [searchParams, router]);

  return null;
}
