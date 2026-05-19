import Link from 'next/link';
import { listPublishedSpaces } from '@/db/queries/spaces';
import { DataView, type DataViewStatus } from '@/components/data-view';
import { logger } from '@/lib/logger';
import type { Space } from '@/db/schema';

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ city?: string }>;
}) {
  const { city } = await searchParams;
  const cityFilter = city?.trim() ? city.trim() : undefined;

  let spaces: Space[] = [];
  let status: DataViewStatus = 'loaded';
  try {
    spaces = await listPublishedSpaces({ city: cityFilter });
    if (spaces.length === 0) status = 'empty';
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error('home_page_list_failed', { error: msg });
    status = 'error';
  }

  return (
    <main
      className="container-content"
      style={{ paddingTop: '3rem', paddingBottom: '4rem' }}
    >
      <header className="mb-10">
        <h1
          className="page-display"
          style={{ maxWidth: '36rem' }}
          data-testid="landing-h1"
        >
          Find a desk. Book a day. Get to work.
        </h1>
        <p
          className="mt-3 muted-strong"
          style={{ fontSize: '1rem', maxWidth: '36rem', lineHeight: 1.55 }}
        >
          DeskHive helps remote workers find and book coworking desks
          across cities — pick a date, pick a desk, you&apos;re set.
        </p>
      </header>

      <form
        action="/"
        method="GET"
        className="mb-10"
        style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', maxWidth: '36rem' }}
      >
        <div style={{ flex: 1 }}>
          <label htmlFor="city" className="field-label">
            Filter by city
          </label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue={cityFilter ?? ''}
            placeholder="e.g. Tashkent"
            className="input"
            style={{ height: '2.75rem', fontSize: '15px' }}
          />
        </div>
        <button type="submit" className="btn btn-primary" style={{ height: '2.75rem' }}>
          Search
        </button>
        {cityFilter && (
          <Link
            href="/"
            className="btn-ghost"
            style={{ textDecoration: 'none', height: '2.75rem' }}
          >
            Clear filter
          </Link>
        )}
      </form>

      <DataView status={status} emptyMessage="No spaces available yet.">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((s) => (
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
                    <h2
                      className="font-semibold"
                      style={{
                        color: 'var(--color-neutral-900)',
                        fontSize: '15px',
                        lineHeight: 1.35,
                      }}
                    >
                      {s.name}
                    </h2>
                    <p
                      className="mt-1 muted"
                      style={{ fontSize: '13px' }}
                    >
                      {s.city}
                    </p>
                  </div>
                </article>
              </Link>
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
