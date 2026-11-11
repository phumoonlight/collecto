import { useCallback, useEffect, useState } from 'react'
import { api, failure, type Collection } from '../api'
import { ShelfList } from './collection-shelves'
import { CollectionView } from './collection-view'

/**
 * Collections: the shelves the website shows, and the whole of what this window puts there.
 * Two views in one file, because they are two halves of one gesture — the shelf list, and one
 * shelf open.
 */

/** Which shelf was open. Survives a trip to Settings and back; a fact about a session. */
let opened: string | null = null

export function Collections({ siteUrl }: { siteUrl: string }) {
  const [collections, setCollections] = useState<Collection[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(opened)

  /** `force` is 🔄 Refresh: the list is cached for a day, and that press means "ask again".
   *  Coming back from a shelf does not force it — every write there drops the cache. */
  const refresh = useCallback(async (force = false) => {
    setLoading(true)
    try {
      setCollections(await api.listCollections(force))
      setError(null)
    } catch (reason) {
      setError(failure(reason))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let alive = true
    api
      .listCollections()
      .then((rows) => {
        if (!alive) return
        setCollections(rows)
        setError(null)
      })
      .catch((reason) => {
        if (alive) setError(failure(reason))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [])

  const show = (id: string | null) => {
    opened = id
    setOpen(id)
  }

  if (open !== null) {
    return (
      <CollectionView
        // Keyed, so opening another shelf mounts a fresh screen.
        key={open}
        collectionId={open}
        collection={collections.find((row) => row.id === open)}
        // The whole list, because a selection can be moved to any other shelf.
        collections={collections}
        siteUrl={siteUrl}
        onBack={() => {
          show(null)
          // The list holds a count and a cover this shelf may have just changed.
          void refresh()
        }}
      />
    )
  }

  return (
    <ShelfList
      collections={collections}
      loading={loading}
      error={error}
      onRefresh={() => void refresh(true)}
      onOpen={show}
      onCreated={(id) => {
        // Straight into the shelf just named: you name one because you have images for it.
        void refresh()
        show(id)
      }}
    />
  )
}
