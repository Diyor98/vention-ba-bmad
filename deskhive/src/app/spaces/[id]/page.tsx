import { notFound } from 'next/navigation';
import { getPublishedSpaceById } from '@/db/queries/spaces';
import { listActiveDesksForSpace } from '@/db/queries/desks';
import { listActiveBookingsForSpaceOnDate } from '@/db/queries/bookings';
import { computeDeskAvailability } from '@/lib/availability';
import { parseDateParam, formatCents, todayIso } from '@/lib/format';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { logger } from '@/lib/logger';
import { BookDeskButton } from './book-desk-button';
import type { Booking, Desk } from '@/db/schema';

export default async function SpaceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ date?: string }>;
}) {
  const { id } = await params;
  const { date: dateParam } = await searchParams;
  const dateResult = parseDateParam(dateParam);

  // Resolve the space first — outside try/catch so notFound()'s control-flow
  // signal isn't accidentally caught.
  const space = await getPublishedSpaceById(id);
  if (!space) notFound();

  let desks: Desk[] = [];
  let bookings: Booking[] = [];
  let dataStatus: DataViewStatus = 'loaded';
  try {
    desks = await listActiveDesksForSpace(id);
    if (dateResult.valid) {
      bookings = await listActiveBookingsForSpaceOnDate(id, dateResult.iso);
    }
    if (desks.length === 0) dataStatus = 'empty';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('space_detail_page_failed', { error: msg });
    dataStatus = 'error';
  }

  const availability =
    dateResult.valid && dataStatus === 'loaded'
      ? computeDeskAvailability(desks, bookings)
      : null;

  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="mb-2 text-2xl font-semibold">{space.name}</h1>
      <p className="mb-4 text-sm text-gray-600">{space.city}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={space.primaryImageUrl}
        alt={space.name}
        className="mb-4 aspect-video w-full rounded object-cover"
      />
      <p className="mb-6 text-sm leading-6 text-gray-700">{space.description}</p>

      <form
        action={`/spaces/${space.id}`}
        method="GET"
        className="mb-2 flex items-end gap-2"
      >
        <div>
          <label htmlFor="date" className="mb-1 block text-sm font-medium">
            Pick a date
          </label>
          <input
            id="date"
            name="date"
            type="date"
            min={todayIso()}
            defaultValue={dateResult.valid ? dateResult.iso : ''}
            className="rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Show availability
        </button>
      </form>
      {!dateResult.valid && dateResult.reason === 'missing' && (
        <p className="mb-4 text-sm text-gray-600">
          Select a date to see availability.
        </p>
      )}
      {!dateResult.valid &&
        (dateResult.reason === 'malformed' || dateResult.reason === 'past') && (
          <p className="mb-4 text-sm text-red-700">
            Please pick today or a future date.
          </p>
        )}

      <h2 className="mb-3 text-xl font-semibold">Desks</h2>
      <DataView
        status={dataStatus}
        emptyMessage="No desks available in this space yet."
      >
        <ul>
          {desks.map((d) => {
            const isAvailable = availability ? availability.get(d.id) ?? false : false;
            const enable = !!availability && isAvailable;
            return (
              <li
                key={d.id}
                className="flex items-center justify-between border-b border-gray-200 py-3 text-sm"
              >
                <span className="font-medium">{d.label}</span>
                <span className="text-gray-700">{formatCents(d.dailyPriceCents)}</span>
                {availability && (
                  <span
                    className={isAvailable ? 'text-green-700' : 'text-red-700'}
                  >
                    {isAvailable ? 'Available' : 'Unavailable'}
                  </span>
                )}
                <BookDeskButton
                  spaceId={space.id}
                  deskId={d.id}
                  bookingDate={dateResult.valid ? dateResult.iso : undefined}
                  enabled={enable}
                />
              </li>
            );
          })}
        </ul>
      </DataView>
    </main>
  );
}
