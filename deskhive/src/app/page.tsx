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
      style={{ paddingTop: '2.5rem', paddingBottom: '4rem' }}
    >
      <header className="mb-8">
        <h1 className="page-h1">Browse spaces</h1>
        <p
          className="mt-1.5 muted-strong"
          style={{ fontSize: '14px' }}
        >
          Find a desk, book a day, get to work.
        </p>
      </header>

      <form
        action="/"
        method="GET"
        className="mb-8 flex items-end gap-3"
      >
        <div className="flex-1">
          <label htmlFor="city" className="field-label">
            Filter by city
          </label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue={cityFilter ?? ''}
            placeholder="e.g. Berlin"
            className="input"
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {cityFilter && (
          <Link
            href="/"
            className="btn-ghost"
            style={{ textDecoration: 'none' }}
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
