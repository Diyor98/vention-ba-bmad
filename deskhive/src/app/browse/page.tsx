import Link from 'next/link';
import { Search, Star, X } from 'lucide-react';
import { listPublishedSpaces } from '@/db/queries/spaces';
import {
  getActiveDeskCountBySpaceIds,
  getMinActiveDailyPriceCentsBySpaceIds,
} from '@/db/queries/desks';
import { getActiveBookingCountByDateAndSpaceIds } from '@/db/queries/bookings';
import { getAverageRatingBySpaceIds } from '@/db/queries/reviews';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { pickAmenityPreview } from '@/components/amenities';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
import type { Space } from '@/db/schema';

/**
 * DESIGN-INT-GAPS-PASS-2 Gap 2 + Round-2 Correction 2 — /browse is
 * the searchable grid view per prototype lines 783-806.
 *
 * Round-2 fix: the Round-1 implementation kept the pre-Gap-2 landing
 * page markup verbatim (large "Find a desk..." h1, "How it works"
 * 3-tile row, left-aligned filter form). BA review found that page
 * read like a second landing page and got confused with /. This
 * rewrite matches the prototype's actual /browse shape:
 *   - h1 "Browse spaces" + "{N} spaces ready to book today." sub
 *   - Right-aligned search input (no big H1, no how-it-works,
 *     no labeled filter form)
 *   - Grid + empty state below
 *
 * Server-side filtering is preserved (form action="/browse"
 * method="GET" — Enter or the icon-button submits). The Round-1
 * `data-testid="landing-h1"` is renamed to `browse-h1` because the
 * old name was misleading; no test referenced it.
 */
export default async function BrowsePage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  const cityFilter = city?.trim() ? city.trim() : undefined;

  // DESIGN-INT-GAPS-PASS-2 Round 4 Gap F — server "today" used to
  // count active bookings for the spots-left math. ISO YYYY-MM-DD
  // against the `bookings.booking_date` `date` column.
  const today = new Date().toISOString().slice(0, 10);

  let spaces: Space[] = [];
  let status: DataViewStatus = 'loaded';
  let minPriceBySpaceId = new Map<string, number>();
  let ratingBySpaceId = new Map<string, { avg: number; count: number }>();
  let deskCountBySpaceId = new Map<string, number>();
  let bookedTodayBySpaceId = new Map<string, number>();
  try {
    spaces = await listPublishedSpaces({ city: cityFilter });
    if (spaces.length === 0) {
      status = 'empty';
    } else {
      const ids = spaces.map((s) => s.id);
      [
        minPriceBySpaceId,
        ratingBySpaceId,
        deskCountBySpaceId,
        bookedTodayBySpaceId,
      ] = await Promise.all([
        getMinActiveDailyPriceCentsBySpaceIds(ids),
        getAverageRatingBySpaceIds(ids),
        getActiveDeskCountBySpaceIds(ids),
        getActiveBookingCountByDateAndSpaceIds(ids, today),
      ]);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('browse_page_list_failed', { error: msg });
    status = 'error';
  }

  const count = spaces.length;
  const countCopy = cityFilter
    ? `${count} ${count === 1 ? 'space' : 'spaces'} match "${cityFilter}".`
    : `${count} ${count === 1 ? 'space' : 'spaces'} ready to book today.`;

  return (
    <main
      className="container-content"
      style={{ paddingTop: '2rem', paddingBottom: '4rem' }}
    >
      <header
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '1.25rem',
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h1
            className="font-semibold"
            data-testid="browse-h1"
            style={{
              fontSize: '1.5rem',
              letterSpacing: '-0.01em',
              color: 'var(--color-neutral-900)',
            }}
          >
            Browse spaces
          </h1>
          <p
            className="muted"
            style={{ fontSize: 14, marginTop: '0.25rem' }}
          >
            {countCopy}
          </p>
        </div>

        {/* Right-aligned search per prototype lines 789-792. Form
            wraps the input so Enter submits (icon-button is the
            keyboard-and-mouse fallback). Tiny Clear-filter chip
            appears only when a filter is active. */}
        <form
          action="/browse"
          method="GET"
          role="search"
          style={{
            position: 'relative',
            width: '18rem',
            maxWidth: '100%',
          }}
        >
          <label htmlFor="browse-search" className="sr-only">
            Search by city or neighborhood
          </label>
          <Search
            aria-hidden="true"
            size={14}
            style={{
              position: 'absolute',
              left: '0.75rem',
              top: '50%',
              transform: 'translateY(-50%)',
              color: 'var(--color-neutral-400)',
              pointerEvents: 'none',
            }}
          />
          <input
            id="browse-search"
            name="city"
            type="text"
            defaultValue={cityFilter ?? ''}
            placeholder="City, neighborhood…"
            className="input"
            data-testid="browse-search"
            style={{
              paddingLeft: '2.25rem',
              height: '2.5rem',
              fontSize: 14,
            }}
          />
          {/* Keep an off-screen submit so screen-reader / no-JS
              users get an explicit affordance; Enter on the input
              already submits in all browsers. */}
          <button
            type="submit"
            className="sr-only"
            aria-label="Search spaces"
          >
            Search
          </button>
          {cityFilter && (
            <Link
              href="/browse"
              data-testid="browse-clear-filter"
              aria-label="Clear filter"
              style={{
                position: 'absolute',
                right: '0.5rem',
                top: '50%',
                transform: 'translateY(-50%)',
                width: '1.5rem',
                height: '1.5rem',
                borderRadius: '999px',
                display: 'inline-grid',
                placeItems: 'center',
                color: 'var(--color-neutral-500)',
                textDecoration: 'none',
                background: 'var(--color-neutral-100)',
              }}
            >
              <X size={12} aria-hidden="true" />
            </Link>
          )}
        </form>
      </header>

      <DataView
        status={status}
        emptyMessage={
          cityFilter
            ? `No spaces match "${cityFilter}". Try a different city.`
            : 'No spaces available yet.'
        }
      >
        <ul
          className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
          data-testid="browse-grid"
        >
          {spaces.map((s) => {
            const minPriceCents = minPriceBySpaceId.get(s.id);
            const rating = ratingBySpaceId.get(s.id);
            const preview = pickAmenityPreview(s.amenities);
            const totalDesks = deskCountBySpaceId.get(s.id) ?? 0;
            const bookedToday = bookedTodayBySpaceId.get(s.id) ?? 0;
            const spotsLeft = Math.max(0, totalDesks - bookedToday);
            return (
              <li key={s.id}>
                <Link href={`/spaces/${s.id}`} className="card-link">
                  <article className="card">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={s.primaryImageUrl}
                      alt={s.name}
                      className="aspect-video w-full object-cover"
                    />
                    <div className="p-4">
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'baseline',
                          justifyContent: 'space-between',
                          gap: '0.625rem',
                        }}
                      >
                        <h2
                          className="font-semibold"
                          style={{
                            color: 'var(--color-neutral-900)',
                            fontSize: '15px',
                            lineHeight: 1.35,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {s.name}
                        </h2>
                        {rating && rating.count > 0 && (
                          <span
                            data-testid={`space-card-rating-${s.id}`}
                            aria-label={`Rating ${rating.avg.toFixed(1)} out of 5`}
                            className="tnum"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.25rem',
                              fontSize: 13,
                              fontWeight: 600,
                              color: 'var(--color-neutral-900)',
                              flex: 'none',
                            }}
                          >
                            <Star
                              size={13}
                              aria-hidden="true"
                              style={{
                                color: '#F59E0B',
                                fill: '#F59E0B',
                              }}
                            />
                            {rating.avg.toFixed(1)}
                          </span>
                        )}
                      </div>
                      <p
                        className="mt-1 muted"
                        style={{ fontSize: '13px' }}
                      >
                        {s.city}
                      </p>
                      {preview.length > 0 && (
                        <ul
                          className="card-amenity-preview"
                          data-testid={`card-amenities-${s.id}`}
                          style={{
                            marginTop: '0.5rem',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            color: 'var(--color-neutral-600)',
                          }}
                        >
                          {preview.map(({ slug, label, Icon }) => (
                            <li
                              key={slug}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem',
                                fontSize: '12px',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Icon
                                aria-hidden="true"
                                style={{ width: 14, height: 14 }}
                              />
                              <span>{label}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {(minPriceCents != null || totalDesks > 0) && (
                        <div
                          style={{
                            marginTop: '0.625rem',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: '0.5rem',
                            flexWrap: 'wrap',
                          }}
                        >
                          {minPriceCents != null ? (
                            <p
                              className="tnum"
                              data-testid={`card-price-${s.id}`}
                              style={{
                                fontSize: '13px',
                                color: 'var(--color-neutral-700)',
                                fontWeight: 500,
                                margin: 0,
                              }}
                            >
                              from <strong style={{ color: 'var(--color-neutral-900)', fontWeight: 600 }}>{formatCents(minPriceCents)}</strong>
                              <span style={{ color: 'var(--color-neutral-500)', fontWeight: 400 }}> / day</span>
                            </p>
                          ) : (
                            <span aria-hidden="true" />
                          )}
                          <SpotsLeftBadge
                            spaceId={s.id}
                            totalDesks={totalDesks}
                            spotsLeft={spotsLeft}
                          />
                        </div>
                      )}
                    </div>
                  </article>
                </Link>
              </li>
            );
          })}
        </ul>
      </DataView>
    </main>
  );
}

// DESIGN-INT-GAPS-PASS-2 Round 4 Gap F — dot + label badge. Renders
// nothing when totalDesks === 0 (the space has no desks at all, so
// "Fully booked today" would be misleading). Otherwise: green dot +
// "{N} spots left" / "1 spot left", or muted dot + "Fully booked
// today" at zero.
function SpotsLeftBadge({
  spaceId,
  totalDesks,
  spotsLeft,
}: {
  spaceId: string;
  totalDesks: number;
  spotsLeft: number;
}) {
  if (totalDesks <= 0) return null;
  const isFullyBooked = spotsLeft <= 0;
  const dotColor = isFullyBooked
    ? 'var(--color-neutral-400)'
    : '#10B981';
  const textColor = isFullyBooked
    ? 'var(--color-neutral-500)'
    : '#047857';
  const label = isFullyBooked
    ? 'Fully booked today'
    : `${spotsLeft} ${spotsLeft === 1 ? 'spot' : 'spots'} left`;
  return (
    <span
      data-testid={
        isFullyBooked
          ? `space-card-fully-booked-${spaceId}`
          : `space-card-spots-left-${spaceId}`
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        fontSize: 12,
        fontWeight: 500,
        color: textColor,
        whiteSpace: 'nowrap',
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 6,
          height: 6,
          borderRadius: '999px',
          background: dotColor,
          display: 'inline-block',
        }}
      />
      {label}
    </span>
  );
}
