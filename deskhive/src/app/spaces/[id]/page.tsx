import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getPublishedSpaceById } from '@/db/queries/spaces';
import { listActiveDesksForSpace } from '@/db/queries/desks';
import { listActiveBookingsForSpaceOnDate } from '@/db/queries/bookings';
import { getUserById } from '@/db/queries/users';
import { computeDeskAvailability } from '@/lib/availability';
import { parseDateParam, formatCents } from '@/lib/format';
import { calculatePlatformFee } from '@/lib/money';
import { AmenitiesDisplay } from '@/components/amenities';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { logger } from '@/lib/logger';
import { BookDeskButton } from './book-desk-button';
import { DatePickerForm } from './date-picker-form';
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
  // DESIGN-INT-2 — resolve the host (space.ownerId) so the page can render
  // the "Hosted by …" affordance. Falls back to null for Phase 1 admin-
  // owned spaces (ownerId IS NULL) — the host card simply doesn't render.
  let host: { id: string; email: string; fullName: string } | null = null;
  try {
    desks = await listActiveDesksForSpace(id);
    if (dateResult.valid) {
      bookings = await listActiveBookingsForSpaceOnDate(id, dateResult.iso);
    }
    if (desks.length === 0) dataStatus = 'empty';
    if (space.ownerId) {
      host = await getUserById(space.ownerId);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('space_detail_page_failed', { error: msg });
    dataStatus = 'error';
  }

  const availability =
    dateResult.valid && dataStatus === 'loaded'
      ? computeDeskAvailability(desks, bookings)
      : null;
  const datePicked = dateResult.valid;

  return (
    <main
      className="container-content"
      style={{ paddingTop: '2rem', paddingBottom: '4rem' }}
    >
      <nav
        className="breadcrumb tnum mb-6"
        aria-label="Breadcrumb"
        style={{ fontSize: '13px' }}
      >
        <Link href="/">Browse spaces</Link>
        <span
          className="mx-1.5"
          style={{ color: 'var(--color-neutral-300)' }}
        >
          /
        </span>
        <span style={{ color: 'var(--color-neutral-700)' }}>{space.name}</span>
      </nav>

      <header className="mb-6">
        <h1 className="page-h1">{space.name}</h1>
        <p
          className="mt-1.5 muted-strong"
          style={{ fontSize: '14px' }}
        >
          {space.city} · {space.addressLine}
        </p>
      </header>

      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={space.primaryImageUrl}
        alt={space.name}
        className="hero-img mb-10"
      />

      <div
        className="layout-detail"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 22rem',
          gap: '3rem',
          alignItems: 'start',
        }}
      >
        <section>
          <h2 className="h2 mb-3">About this space</h2>
          <div
            style={{ color: 'var(--color-neutral-700)', maxWidth: '60ch' }}
          >
            {space.description.split('\n').map((p, i) => (
              <p key={i} className={i === 0 ? '' : 'mt-4'}>
                {p}
              </p>
            ))}
          </div>

          <h2 className="h2 mb-3" style={{ marginTop: '2rem' }}>
            Amenities
          </h2>
          <AmenitiesDisplay slugs={space.amenities} />

          {host && (
            /* DESIGN-INT-2 — host info card. Avatar uses brand-50 + brand-700
               initials chip from the design system (.av-sm / Brief PDF). */
            <section
              aria-labelledby="host-h"
              className="form-card"
              style={{ marginTop: '2rem', padding: '1.25rem' }}
              data-testid="space-detail-host-card"
            >
              <h2
                id="host-h"
                className="h2 mb-3"
                style={{ fontSize: 14 }}
              >
                Hosted by
              </h2>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 9999,
                    background: 'var(--color-brand-100)',
                    color: 'var(--color-brand-700)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {host.fullName.trim().charAt(0).toUpperCase() ||
                    host.email.charAt(0).toUpperCase()}
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'var(--color-neutral-900)',
                    }}
                  >
                    {host.fullName}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: 'var(--color-neutral-500)',
                    }}
                  >
                    Space owner on DeskHive
                  </div>
                </div>
              </div>
            </section>
          )}
        </section>

        <aside
          style={{
            position: 'sticky',
            top: 'calc(var(--layout-header-h) + 1.5rem)',
          }}
        >
          <div className={`date-callout${datePicked ? '' : ' is-empty'}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className="step-pill" aria-hidden="true">
                1
              </span>
              <span
                className="font-mono"
                style={{
                  fontSize: '11px',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: 'var(--color-neutral-600)',
                }}
              >
                Pick a date
              </span>
            </div>
            <p
              className="muted"
              style={{ fontSize: '13px', marginBottom: '0.75rem' }}
            >
              Availability and prices update for the day you choose.
            </p>
            <DatePickerForm
              spaceId={space.id}
              initialDate={datePicked ? dateResult.iso : ''}
            />
            {!dateResult.valid &&
              (dateResult.reason === 'malformed' ||
                dateResult.reason === 'past') && (
                <p
                  className="field-error"
                  style={{ marginTop: '0.5rem' }}
                  role="alert"
                >
                  Please pick today or a future date.
                </p>
              )}
          </div>
          <p
            className="mt-3 muted"
            style={{ fontSize: '12px', lineHeight: 1.5 }}
          >
            Bookings are reviewed by the space and confirmed within a few hours.
            You won&apos;t be charged until your booking is confirmed.
          </p>
        </aside>
      </div>

      <section className="mt-12">
        <div className="flex items-baseline justify-between gap-4 mb-1">
          <h2 className="h2 flex items-center gap-2">
            <span
              className={`step-pill${datePicked ? '' : ' step-pill-muted'}`}
              aria-hidden="true"
            >
              2
            </span>
            Desks
          </h2>
          <span className="muted tnum" style={{ fontSize: '13px' }}>
            {desks.length} {desks.length === 1 ? 'desk' : 'desks'}
          </span>
        </div>
        <p className="muted mb-5" style={{ fontSize: '13px' }}>
          Pick a date above to check availability for that day.
        </p>

        <DataView
          status={dataStatus}
          emptyMessage="No desks available in this space yet."
        >
          <ul className="space-y-3">
            {desks.map((d) => {
              const isAvailable = availability
                ? availability.get(d.id) ?? false
                : false;
              const enable = !!availability && isAvailable;
              return (
                <li key={d.id} className="desk-row">
                  <div className="desk-meta">
                    <p
                      className="font-medium"
                      style={{ color: 'var(--color-neutral-900)' }}
                    >
                      {d.label}
                    </p>
                  </div>
                  <span
                    className={`avail ${
                      datePicked ? (isAvailable ? 'avail-yes' : 'avail-no') : 'avail-yes'
                    }`}
                    style={datePicked ? undefined : { opacity: 0.45 }}
                  >
                    <span className="dot" aria-hidden="true" />
                    {datePicked ? (isAvailable ? 'Available' : 'Unavailable') : '—'}
                  </span>
                  <span className="price tnum">
                    <strong>{formatCents(d.dailyPriceCents)}</strong>
                    &nbsp;/ day
                  </span>
                  <div className="desk-cta">
                    <BookDeskButton
                      spaceId={space.id}
                      deskId={d.id}
                      bookingDate={datePicked ? dateResult.iso : undefined}
                      enabled={enable}
                      spaceName={space.name}
                      spaceImageUrl={space.primaryImageUrl}
                      deskLabel={d.label}
                      amountCents={d.dailyPriceCents}
                      platformFeeCents={calculatePlatformFee(d.dailyPriceCents)}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </DataView>

        {!datePicked && desks.length > 0 && (
          <p className="mt-5 desk-list-hint">
            Pick a date above to see which desks are available and unlock
            booking.
          </p>
        )}
      </section>
    </main>
  );
}
