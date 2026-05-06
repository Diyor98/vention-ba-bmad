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
    <main className="mx-auto max-w-6xl p-8">
      <h1 className="mb-6 text-2xl font-semibold">Spaces</h1>

      <form action="/" method="GET" className="mb-6 flex items-end gap-2">
        <div className="flex-1">
          <label htmlFor="city" className="mb-1 block text-sm font-medium">
            Filter by city
          </label>
          <input
            id="city"
            name="city"
            type="text"
            defaultValue={cityFilter ?? ''}
            placeholder="e.g. Berlin"
            className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Search
        </button>
        {cityFilter && (
          <Link
            href="/"
            className="self-end px-2 py-2 text-sm text-gray-700 hover:underline"
          >
            Clear filter
          </Link>
        )}
      </form>

      <DataView status={status} emptyMessage="No spaces available yet.">
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {spaces.map((s) => (
            <li
              key={s.id}
              className="overflow-hidden rounded border border-gray-200"
            >
              <Link
                href={`/spaces/${s.id}`}
                className="block transition-colors hover:bg-gray-50"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={s.primaryImageUrl}
                  alt={s.name}
                  className="aspect-video w-full object-cover"
                />
                <div className="p-3">
                  <h2 className="font-semibold">{s.name}</h2>
                  <p className="text-sm text-gray-600">{s.city}</p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      </DataView>
    </main>
  );
}
