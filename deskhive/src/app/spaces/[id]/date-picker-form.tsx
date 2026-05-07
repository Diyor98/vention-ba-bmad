'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { todayIso } from '@/lib/format';

// Auto-fetching date picker for Space Detail (Story 5-1, AC-9).
// The Server Component reads `searchParams.date` to render desks +
// availability. This Client Component just pushes the URL on change.
// No Submit button — the date input is the entire interaction surface.
//
// `useTransition` keeps the input responsive while the page re-renders.
export function DatePickerForm({
  spaceId,
  initialDate,
}: {
  spaceId: string;
  initialDate: string;
}) {
  const router = useRouter();
  const inputId = useId();
  const [value, setValue] = useState(initialDate);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <label htmlFor={inputId} className="sr-only">
        Date of visit
      </label>
      <input
        id={inputId}
        type="date"
        name="date"
        min={todayIso()}
        value={value}
        className="input tnum"
        style={{ height: '2.75rem', fontSize: '1rem' }}
        onChange={(e) => {
          const next = e.target.value;
          setValue(next);
          if (next) {
            startTransition(() => {
              router.push(`/spaces/${spaceId}?date=${next}`);
            });
          } else {
            startTransition(() => {
              router.push(`/spaces/${spaceId}`);
            });
          }
        }}
        aria-busy={pending || undefined}
      />
    </>
  );
}
