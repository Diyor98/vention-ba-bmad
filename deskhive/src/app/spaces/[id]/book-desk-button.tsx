'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  createBookingWithPaymentAction,
  createBookingWithPaymentEmbeddedAction,
  type CreateBookingWithPaymentActionState,
  type CreateBookingWithPaymentEmbeddedActionState,
} from '@/actions/booking-with-payment';
import { BookingCheckoutEmbed } from '@/components/booking-checkout-embed';
import { toastError, TOAST_COPY } from '@/lib/toast';

/**
 * Story 9-3 + DESIGN-INT-CHECKOUT-EMBED Phase 2: flag-aware Book button.
 *
 * Default (NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED !== 'true'):
 *   Legacy hosted-Checkout redirect — action returns redirectUrl, the
 *   client does window.location.assign(url). Byte-for-byte the Story
 *   9-3 behavior; the legacy `<BookDeskButtonLegacy>` sub-component
 *   holds it.
 *
 * Embedded path (NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED === 'true'):
 *   New `createBookingWithPaymentEmbeddedAction` returns a
 *   `clientSecret` + summary data; `<BookDeskButtonEmbedded>` swaps
 *   inline to render `<BookingCheckoutEmbed>`, taking over the page
 *   visually. URL stays at /spaces/[id] until Stripe's return_url
 *   navigates to /my-bookings?just_booked=1 after payment.
 *
 * The flag is a `NEXT_PUBLIC_*` env var, so it's inlined at build time.
 * Toggling requires editing .env.local + restarting the dev server.
 * Phase 3 will flip the default + remove the legacy path; Phase 4
 * removes the flag entirely.
 */

const EMBED_ENABLED =
  process.env.NEXT_PUBLIC_CHECKOUT_EMBED_ENABLED === 'true';

export function BookDeskButton(props: {
  spaceId: string;
  deskId: string;
  bookingDate: string | undefined;
  enabled: boolean;
  spaceName?: string;
  spaceImageUrl?: string;
  deskLabel?: string;
  amountCents?: number;
  platformFeeCents?: number;
}) {
  if (EMBED_ENABLED) {
    return <BookDeskButtonEmbedded {...props} />;
  }
  return <BookDeskButtonLegacy {...props} />;
}

// ── Legacy hosted-Checkout path (Story 9-3 byte-for-byte) ─────────────

const legacyInitialState: CreateBookingWithPaymentActionState = {
  status: 'idle',
};

function BookDeskButtonLegacy({
  spaceId,
  deskId,
  bookingDate,
  enabled,
}: {
  spaceId: string;
  deskId: string;
  bookingDate: string | undefined;
  enabled: boolean;
}) {
  const [state, formAction] = useActionState(
    createBookingWithPaymentAction,
    legacyInitialState,
  );

  const lastHandledState = useRef<CreateBookingWithPaymentActionState | null>(
    null,
  );
  useEffect(() => {
    if (state.status === 'idle') return;
    if (lastHandledState.current === state) return;
    lastHandledState.current = state;

    if (state.status === 'success') {
      window.location.assign(state.redirectUrl);
      return;
    }

    toastError(TOAST_COPY.BOOKING_FAILED_TITLE, legacyErrorDescription(state));
  }, [state]);

  return (
    <form action={formAction}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="deskId" value={deskId} />
      <input type="hidden" name="bookingDate" value={bookingDate ?? ''} />
      <SubmitButton disabled={!enabled} />
    </form>
  );
}

function legacyErrorDescription(
  state: CreateBookingWithPaymentActionState,
): string {
  if (state.status !== 'error') return TOAST_COPY.BOOKING_FAILED_GENERIC;
  switch (state.code) {
    case 'DOUBLE_BOOKING':
      return TOAST_COPY.BOOKING_FAILED_DOUBLE_BOOKING;
    case 'PAST_DATE':
      return TOAST_COPY.BOOKING_FAILED_PAST_DATE;
    case 'DESK_NOT_FOUND':
      return TOAST_COPY.BOOKING_FAILED_DESK_NOT_FOUND;
    case 'STRIPE_NOT_ACTIVE':
      return TOAST_COPY.BOOKING_FAILED_STRIPE_NOT_ACTIVE;
    case 'VALIDATION_ERROR':
      return Object.values(state.fields)[0] ?? TOAST_COPY.BOOKING_FAILED_GENERIC;
    case 'FORBIDDEN':
    case 'UNAUTHORIZED':
      return state.message;
    case 'INTERNAL_ERROR':
    default:
      return TOAST_COPY.BOOKING_FAILED_PAYMENT_INIT;
  }
}

// ── Embedded Checkout path (DESIGN-INT-CHECKOUT-EMBED Phase 2) ────────

const embedInitialState: CreateBookingWithPaymentEmbeddedActionState = {
  status: 'idle',
};

function BookDeskButtonEmbedded({
  spaceId,
  deskId,
  bookingDate,
  enabled,
  spaceName,
  spaceImageUrl,
  deskLabel,
  amountCents,
  platformFeeCents,
}: {
  spaceId: string;
  deskId: string;
  bookingDate: string | undefined;
  enabled: boolean;
  spaceName?: string;
  spaceImageUrl?: string;
  deskLabel?: string;
  amountCents?: number;
  platformFeeCents?: number;
}) {
  const [state, formAction] = useActionState(
    createBookingWithPaymentEmbeddedAction,
    embedInitialState,
  );
  // Once we have a clientSecret, freeze it locally so re-renders don't
  // double-mount the iframe. The Server Action's state can be replayed
  // by Strict Mode in dev — useState guards against that.
  const [embedded, setEmbedded] =
    useState<null | { clientSecret: string; sessionId: string; bookingId: string }>(
      null,
    );
  const lastHandledState =
    useRef<CreateBookingWithPaymentEmbeddedActionState | null>(null);

  useEffect(() => {
    if (state.status === 'idle') return;
    if (lastHandledState.current === state) return;
    lastHandledState.current = state;

    if (state.status === 'success') {
      // Legitimate state-from-effect: the action's useActionState
      // result IS the trigger. Mirrors the existing toastError call in
      // legacy and follows React 19 Strict Mode's identity-guard ref
      // pattern (lastHandledState).
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEmbedded({
        clientSecret: state.clientSecret,
        sessionId: state.sessionId,
        bookingId: state.bookingId,
      });
      return;
    }

    toastError(TOAST_COPY.BOOKING_FAILED_TITLE, legacyErrorDescription(state));
  }, [state]);

  if (embedded && spaceName && spaceImageUrl && deskLabel && bookingDate &&
      typeof amountCents === 'number' && typeof platformFeeCents === 'number') {
    return (
      <BookingCheckoutEmbed
        clientSecret={embedded.clientSecret}
        spaceId={spaceId}
        spaceName={spaceName}
        spaceImageUrl={spaceImageUrl}
        deskLabel={deskLabel}
        bookingDate={bookingDate}
        amountCents={amountCents}
        platformFeeCents={platformFeeCents}
      />
    );
  }

  return (
    <form action={formAction}>
      <input type="hidden" name="spaceId" value={spaceId} />
      <input type="hidden" name="deskId" value={deskId} />
      <input type="hidden" name="bookingDate" value={bookingDate ?? ''} />
      <SubmitButton disabled={!enabled} />
    </form>
  );
}

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  const isDisabled = disabled || pending;
  return (
    <button
      type="submit"
      disabled={isDisabled}
      aria-disabled={isDisabled || undefined}
      className="btn btn-primary"
    >
      {pending ? 'Booking…' : 'Book this desk'}
    </button>
  );
}
