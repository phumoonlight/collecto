import Link from 'next/link'
import { NavProgress } from '@/components/nav-progress'
import {
  COLLECTION_FILTER_PARAMS,
  COLLECTION_NAME_MAX,
  collectionsHref,
  type CollectionListFilter,
} from '@common/collections'

const FIELD =
  'min-h-11 rounded-lg border border-border bg-surface px-3 text-sm outline-none focus:border-accent'

/**
 * The shelf list's search: a piece of the name. **A plain GET form**, so a search is a URL —
 * shareable, back-buttonable, and working without JavaScript. The page reads the same param
 * back with `readCollectionFilter`.
 */
export function CollectionSearch({ filter }: { filter: CollectionListFilter }) {
  return (
    <form action={collectionsHref()} role="search" className="flex flex-wrap items-center gap-2">
      <input
        type="search"
        name={COLLECTION_FILTER_PARAMS.name}
        defaultValue={filter.name ?? ''}
        maxLength={COLLECTION_NAME_MAX}
        aria-label="Collection name"
        placeholder="Search collections…"
        className={`${FIELD} min-w-0 flex-1 basis-48`}
      />
      <button
        type="submit"
        className="flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-4 text-sm transition-colors hover:border-hover"
      >
        <span aria-hidden>🔍</span> Search
      </button>
      {filter.name && (
        <Link
          href={collectionsHref()}
          className="px-1 text-sm text-muted hover:text-foreground hover:underline"
        >
          Clear
          <NavProgress />
        </Link>
      )}
    </form>
  )
}
