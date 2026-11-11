import { useCallback, useEffect, useState } from 'react'
import { collectionHref, shelfTitle } from '@common/collections'
import { api, failure, type Collection, type CollectionPost } from '../api'
import { BUTTON, BUTTON_SM, buttonToggle } from './buttons'
import { Modal } from './modal'
import { itemStyle } from './ratio-layout'
import { CollectionForm } from './collection-form'
import { ImageCard, ImagePanel } from './collection-image'
import { StagingBox, useStaging } from './collection-staging'
import { ManageBar } from './collection-manage'

/** A screenful, and what Load more adds. */
const CHUNK = 40

/**
 * One shelf, open: its name, what is on it, and the box that puts more there.
 *
 * **The whole window is the drop target.** Files dragged onto it open the upload box and land
 * in the batch — Tauri takes the drop at the window and hands over real paths
 * (`api.onFileDrop`). Images from a web page are pasted as links into the box instead.
 */
export function CollectionView({
  collectionId,
  collection,
  collections,
  siteUrl,
  onBack,
}: {
  collectionId: number
  collection: Collection | undefined
  collections: Collection[]
  siteUrl: string
  onBack: () => void
}) {
  // What an edit here stored, over the row the list was holding.
  const [edited, setEdited] = useState<Pick<Collection, 'name' | 'mark'> | null>(null)
  const shelf = edited ?? collection
  const name = shelf?.name ?? 'Collection'
  const [posts, setPosts] = useState<CollectionPost[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [nonce, setNonce] = useState(0)

  const [renaming, setRenaming] = useState(false)
  const closeRenaming = useCallback(() => setRenaming(false), [])
  // Shut until asked for: most visits to a shelf are to look at it.
  const [uploading, setUploading] = useState(false)
  // Manage is a mode of the grid: a click selects rather than opening the panel.
  const [managing, setManaging] = useState(false)
  const [selected, setSelected] = useState<number[]>([])
  const [notice, setNotice] = useState<string | null>(null)

  const [dragging, setDragging] = useState(false)
  const [editing, setEditing] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    api
      .listCollectionPosts({ collectionId, perPage: CHUNK })
      .then((page) => {
        if (!alive) return
        setPosts(page.posts)
        setHasMore(page.hasMore)
      })
      .catch((reason) => {
        if (alive) setNotice(`Could not read this collection: ${failure(reason)}`)
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [collectionId, nonce])

  /** Read this shelf again — what every write here owes the grid it just changed. */
  const reload = useCallback(() => {
    setLoading(true)
    setNonce((n) => n + 1)
  }, [])

  async function loadMore() {
    const last = posts[posts.length - 1]
    if (!last) return
    setLoading(true)
    try {
      const page = await api.listCollectionPosts({ collectionId, after: last.id, perPage: CHUNK })
      // Appended, never replaced: a chunk landing must not reflow rows already scrolled past.
      setPosts((current) => [...current, ...page.posts])
      setHasMore(page.hasMore)
    } catch (reason) {
      setNotice(failure(reason))
    } finally {
      setLoading(false)
    }
  }

  const staging = useStaging(collectionId, reload)
  const { stage } = staging

  useEffect(
    () =>
      api.onFileDrop({
        over: () => {
          setDragging(true)
          setUploading(true)
        },
        leave: () => setDragging(false),
        drop: (paths) => {
          setDragging(false)
          void stage(paths)
        },
      }),
    [stage]
  )

  async function destroy() {
    const result = await api.deleteCollection(collectionId)
    if (!result.ok) {
      // The ordinary answer while anything is still on the shelf — it says how many.
      setNotice(result.error)
      return
    }
    onBack()
  }

  const editingPost = posts.find((post) => post.id === editing) ?? null
  // Held here rather than in the panel, which is keyed by image and remounts on every step.
  const [viewing, setViewing] = useState(false)
  const step = (delta: -1 | 1) => {
    const next = posts[posts.findIndex((post) => post.id === editing) + delta]
    if (next) setEditing(next.id)
  }

  return (
    <div className="min-h-full w-full">
      <div className="mx-auto flex w-full max-w-[1800px] flex-col gap-4 px-4 pt-4 pb-25">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <button type="button" onClick={onBack} className={BUTTON_SM}>
            <span aria-hidden>⬅️</span> Collections
          </button>
          <h1 className="text-lg font-bold tracking-tight">{shelf ? shelfTitle(shelf) : name}</h1>
          <span className="text-xs text-muted">#{collectionId}</span>
          <span className="text-xs text-muted">
            {loading
              ? 'reading…'
              : `${posts.length}${hasMore ? '+' : ''} image${posts.length === 1 && !hasMore ? '' : 's'}`}
          </span>
          <div className="ml-auto flex items-center">
            <button
              type="button"
              onClick={() => {
                setManaging((was) => !was)
                setSelected([])
                setEditing(null)
              }}
              aria-pressed={managing}
              className={buttonToggle(managing)}
            >
              <span aria-hidden>🗂️</span> Manage
            </button>
            <button
              type="button"
              onClick={() => setUploading((was) => !was)}
              aria-pressed={uploading}
              className={buttonToggle(uploading)}
            >
              <span aria-hidden>📤</span> Upload
            </button>
            <button
              type="button"
              onClick={() => {
                setRenaming((was) => !was)
                setNotice(null)
              }}
              aria-pressed={renaming}
              className={buttonToggle(renaming)}
            >
              <span aria-hidden>✏️</span> Edit
            </button>
            {siteUrl && (
              <button
                type="button"
                onClick={() => void api.openExternal(`${siteUrl}${collectionHref(collectionId)}`)}
                title="Open this collection in your browser"
                className={BUTTON}
              >
                <span aria-hidden>🌐</span> Open
              </button>
            )}
            {/* Drawn whatever the shelf holds, and refused with a count while it holds
                anything — a button that says why beats one that disappears. */}
            <button type="button" onClick={() => void destroy()} className={BUTTON}>
              <span aria-hidden>🗑️</span> Delete
            </button>
          </div>
        </div>

        {renaming && (
          <Modal title="Edit collection" onClose={closeRenaming}>
            <CollectionForm
              initial={{ name, mark: shelf?.mark ?? '' }}
              submitLabel="Save"
              onSubmit={async (input) => {
                const result = await api.editCollection(collectionId, input)
                if (!result.ok) return result.error
                setEdited({ name: result.name, mark: result.mark })
                setRenaming(false)
                return null
              }}
            />
          </Modal>
        )}

        {notice && (
          <p className="border border-border bg-surface px-3 py-2 text-sm text-[#ff5d5f]">
            {notice}
          </p>
        )}

        {/* Forced open by anything it is holding or doing — closing it must not hide a staged
            batch or an upload in progress. */}
        {(uploading || dragging || staging.staged.length > 0 || staging.working !== null) && (
          <StagingBox staging={staging} name={name} dragging={dragging} />
        )}

        {managing && (
          <ManageBar
            collectionId={collectionId}
            collections={collections}
            selected={selected}
            loaded={posts.length}
            onSelectAll={() => setSelected(posts.map((post) => post.id))}
            onClear={() => setSelected([])}
            onMoved={(moved) => {
              setSelected([])
              setNotice(moved === 0 ? 'Those images were already there.' : null)
              reload()
            }}
          />
        )}

        {posts.length === 0 ? (
          <p className="border border-border bg-surface px-4 py-10 text-center text-sm text-muted">
            {loading ? 'Loading…' : 'Nothing in this collection yet. 📤 Upload, or drop images here.'}
          </p>
        ) : (
          <>
            {/* One height, each tile as wide as its own shape (`ratio-layout.ts`). */}
            <ul className="flex flex-wrap justify-center gap-0.5 [--row-h:9rem] sm:[--row-h:11rem] lg:[--row-h:22.5rem]">
              {posts.map((post) => (
                <li key={post.id} className="shrink-0" style={itemStyle(post.width, post.height)}>
                  <ImageCard
                    post={post}
                    selected={managing ? selected.includes(post.id) : undefined}
                    current={!managing && post.id === editing}
                    onView={
                      managing
                        ? undefined
                        : () => {
                            setEditing(post.id)
                            setViewing(true)
                          }
                    }
                    onOpen={() =>
                      managing
                        ? setSelected((was) =>
                            was.includes(post.id)
                              ? was.filter((id) => id !== post.id)
                              : [...was, post.id]
                          )
                        : setEditing(post.id)
                    }
                  />
                </li>
              ))}
            </ul>
            {hasMore && (
              <button
                type="button"
                onClick={() => void loadMore()}
                disabled={loading}
                className={`${BUTTON} mx-auto`}
              >
                {loading ? (
                  <>
                    <span aria-hidden>⏳</span> Loading…
                  </>
                ) : (
                  <>
                    <span aria-hidden>⬇️</span> Load {CHUNK} more
                  </>
                )}
              </button>
            )}
          </>
        )}

        {editingPost && (
          <ImagePanel
            // Keyed, so another tile mounts a fresh panel seeded from its own row.
            key={editingPost.id}
            post={editingPost}
            siteUrl={siteUrl}
            viewing={viewing}
            onViewing={setViewing}
            onStep={step}
            onClose={() => {
              setViewing(false)
              setEditing(null)
            }}
            onChanged={reload}
            onDeleted={() => {
              setViewing(false)
              setEditing(null)
              reload()
            }}
          />
        )}
      </div>
    </div>
  )
}
