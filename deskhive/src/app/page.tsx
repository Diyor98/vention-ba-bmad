import Link from 'next/link';
import { ArrowRight, Calendar, Check, Search, Star } from 'lucide-react';
import { listPublishedSpaces } from '@/db/queries/spaces';
import {
  getActiveDeskCountBySpaceIds,
  getMinActiveDailyPriceCentsBySpaceIds,
} from '@/db/queries/desks';
import { getAverageRatingBySpaceIds } from '@/db/queries/reviews';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { pickAmenityPreview } from '@/components/amenities';
import { formatCents } from '@/lib/format';
import { logger } from '@/lib/logger';
import type { Space } from '@/db/schema';

// DESIGN-INT-GAPS-PASS-2 Gap 2 — / is the marketing landing.
// Mirrors prototype DeskHive_Prototype.html lines 717-780 (Landing
// component, showHero={true} featuredOnly={true}): two-column hero
// (copy + buttons | featured-space card), the existing 3-up
// "Search a city / Pick a day / Pay & show up" feature row, and a
// 3-space Featured rail with a Browse-all CTA.
//
// The full searchable grid moved to /browse/page.tsx.

export default async function HomePage() {
  let spaces: Space[] = [];
  let status: DataViewStatus = 'loaded';
  let minPriceBySpaceId = new Map<string, number>();
  let deskCountBySpaceId = new Map<string, number>();
  let ratingBySpaceId = new Map<string, { avg: number; count: number }>();
  try {
    spaces = await listPublishedSpaces();
    if (spaces.length === 0) {
      status = 'empty';
    } else {
      const ids = spaces.map((s) => s.id);
      // Featured rail + hero card both render price; hero card also
      // shows desk count; featured rail also shows ★ rating. One
      // query per metric across every published space (cheap on
      // first page-load + cache-friendly).
      [minPriceBySpaceId, deskCountBySpaceId, ratingBySpaceId] =
        await Promise.all([
          getMinActiveDailyPriceCentsBySpaceIds(ids),
          getActiveDeskCountBySpaceIds(ids),
          getAverageRatingBySpaceIds(ids),
        ]);
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('home_page_list_failed', { error: msg });
    status = 'error';
  }

  const heroSpace = spaces[0];
  const featured = spaces.slice(0, 3);
  const totalActive = spaces.length;

  return (
    <main
      className="container-content"
      style={{ paddingTop: '1.5rem', paddingBottom: '4rem' }}
    >
      {/* ── Hero (2-col) ────────────────────────────────────────── */}
      <section
        className="grid grid-cols-1 md:grid-cols-2 gap-10 items-center"
        style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}
        data-testid="landing-hero"
      >
        <div>
          <div
            style={{
              fontSize: 11,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: 'var(--color-brand-700)',
              fontWeight: 600,
              marginBottom: '0.75rem',
            }}
          >
            DeskHive · book the day
          </div>
          <h1
            className="page-display"
            style={{ maxWidth: '36rem' }}
            data-testid="landing-h1"
          >
            A desk for the day.{' '}
            <span style={{ color: 'var(--color-brand-700)' }}>
              Anywhere you work.
            </span>
          </h1>
          <p
            className="mt-3 muted-strong"
            style={{ fontSize: '1.0625rem', maxWidth: '34rem', lineHeight: 1.55 }}
          >
            Hundreds of independent coworking spaces, one booking. No
            memberships, no contracts — pay as you go.
          </p>
          <div
            style={{
              marginTop: '1.5rem',
              display: 'flex',
              gap: '0.75rem',
              flexWrap: 'wrap',
            }}
          >
            <Link
              href="/browse"
              className="btn btn-primary"
              data-testid="hero-cta-browse"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
            >
              <Search size={16} aria-hidden="true" />
              Browse spaces
            </Link>
            <Link
              href="/become-a-host"
              className="btn btn-secondary"
              data-testid="hero-cta-host"
            >
              Host your space
            </Link>
          </div>
        </div>

        {heroSpace ? (
          <article
            className="card"
            style={{ overflow: 'hidden' }}
            data-testid="hero-card"
          >
            <div
              style={{
                position: 'relative',
                width: '100%',
                aspectRatio: '4 / 3',
                background: 'var(--color-neutral-100)',
                overflow: 'hidden',
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={heroSpace.primaryImageUrl}
                alt={`${heroSpace.name} · ${heroSpace.city}`}
                loading="lazy"
                style={{
                  position: 'absolute',
                  inset: 0,
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  inset: 0,
                  background:
                    'linear-gradient(to top, rgba(0,0,0,0.55), rgba(0,0,0,0) 60%)',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: '1rem',
                  bottom: '0.75rem',
                  color: '#ffffff',
                  fontWeight: 600,
                  letterSpacing: '-0.01em',
                  fontSize: '1.125rem',
                  textShadow: '0 1px 2px rgba(0,0,0,0.3)',
                }}
              >
                {heroSpace.name} · {heroSpace.city.split(',')[0]}
              </div>
            </div>
            <div
              style={{
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.75rem',
                fontSize: 14,
              }}
            >
              <div>
                <div
                  className="tnum"
                  style={{
                    fontWeight: 500,
                    color: 'var(--color-neutral-900)',
                  }}
                >
                  {minPriceBySpaceId.get(heroSpace.id) != null
                    ? `From ${formatCents(minPriceBySpaceId.get(heroSpace.id)!)} / day`
                    : 'Pricing on request'}
                </div>
                <div
                  className="muted"
                  style={{ fontSize: 13, marginTop: 2 }}
                >
                  {(() => {
                    const c = deskCountBySpaceId.get(heroSpace.id) ?? 0;
                    return c > 0
                      ? `${c} ${c === 1 ? 'desk' : 'desks'} available`
                      : 'New space';
                  })()}
                </div>
              </div>
              <Link
                href={`/spaces/${heroSpace.id}`}
                className="btn btn-secondary btn-sm"
                data-testid="hero-card-view"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                }}
              >
                View
                <ArrowRight size={14} aria-hidden="true" />
              </Link>
            </div>
          </article>
        ) : (
          // Empty/error state placeholder so the right column doesn't
          // collapse the grid (prototype always has at least one Active
          // space; this is a safety net for fresh DBs).
          <div
            className="card"
            data-testid="hero-card-empty"
            style={{
              padding: '2rem',
              textAlign: 'center',
              color: 'var(--color-neutral-500)',
              fontSize: 14,
            }}
          >
            New spaces are on their way. Check back soon.
          </div>
        )}
      </section>

      {/* ── 3-up feature row ─────────────────────────────────────── */}
      <section
        className="grid grid-cols-1 md:grid-cols-3 gap-4"
        style={{ marginTop: '3rem', marginBottom: '3rem' }}
        data-testid="how-it-works"
      >
        {[
          {
            Icon: Search,
            title: 'Search a city',
            body: "Find spaces near where you'll be — by city, neighborhood, or vibe.",
          },
          {
            Icon: Calendar,
            title: 'Pick a day',
            body: 'See real-time availability for the desk you want.',
          },
          {
            Icon: Check,
            title: 'Pay & show up',
            body: "Card on file. We'll email the details once your host confirms.",
          },
        ].map((step) => (
          <article
            key={step.title}
            className="card"
            style={{ padding: '1.25rem' }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '2.5rem',
                height: '2.5rem',
                borderRadius: 'var(--radius-lg)',
                background: 'var(--color-brand-50)',
                color: 'var(--color-brand-700)',
                display: 'grid',
                placeItems: 'center',
                marginBottom: '0.75rem',
              }}
            >
              <step.Icon size={18} />
            </span>
            <div
              className="font-semibold"
              style={{ color: 'var(--color-neutral-900)' }}
            >
              {step.title}
            </div>
            <div
              className="mt-1.5 muted-strong"
              style={{ fontSize: '13px', lineHeight: 1.55 }}
            >
              {step.body}
            </div>
          </article>
        ))}
      </section>

      {/* ── Featured spaces rail ─────────────────────────────────── */}
      <section
        style={{ marginTop: '1rem' }}
        data-testid="featured-spaces"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: '1rem',
            marginBottom: '1rem',
          }}
        >
          <div>
            <h2
              className="font-semibold"
              style={{
                color: 'var(--color-neutral-900)',
                fontSize: '1.25rem',
                letterSpacing: '-0.01em',
              }}
            >
              Featured spaces
            </h2>
            <p
              className="mt-1 muted"
              style={{ fontSize: 13 }}
            >
              A taste of what&apos;s on DeskHive right now.
            </p>
          </div>
          <Link
            href="/browse"
            className="btn btn-secondary btn-sm"
            data-testid="featured-browse-all-top"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
            }}
          >
            Browse all spaces
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </div>

        <DataView status={status} emptyMessage="No spaces available yet.">
          <ul
            className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3"
            data-testid="featured-grid"
          >
            {featured.map((s) => {
              const minPriceCents = minPriceBySpaceId.get(s.id);
              const rating = ratingBySpaceId.get(s.id);
              const preview = pickAmenityPreview(s.amenities);
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
                          <h3
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
                          </h3>
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
                            data-testid={`featured-amenities-${s.id}`}
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
                        {minPriceCents != null && (
                          <p
                            className="tnum"
                            data-testid={`featured-price-${s.id}`}
                            style={{
                              marginTop: '0.625rem',
                              fontSize: '13px',
                              color: 'var(--color-neutral-700)',
                              fontWeight: 500,
                            }}
                          >
                            from{' '}
                            <strong
                              style={{
                                color: 'var(--color-neutral-900)',
                                fontWeight: 600,
                              }}
                            >
                              {formatCents(minPriceCents)}
                            </strong>
                            <span
                              style={{
                                color: 'var(--color-neutral-500)',
                                fontWeight: 400,
                              }}
                            >
                              {' '}
                              / day
                            </span>
                          </p>
                        )}
                      </div>
                    </article>
                  </Link>
                </li>
              );
            })}
          </ul>
        </DataView>

        {totalActive > 0 && (
          <div style={{ marginTop: '2rem', textAlign: 'center' }}>
            <Link
              href="/browse"
              className="btn btn-primary"
              data-testid="featured-browse-all-bottom"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
              }}
            >
              <Search size={16} aria-hidden="true" />
              Browse all {totalActive}{' '}
              {totalActive === 1 ? 'space' : 'spaces'}
            </Link>
          </div>
        )}
      </section>
    </main>
  );
}
