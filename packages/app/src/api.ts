import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWebview } from '@tauri-apps/api/webview'
import type { Collection, CollectionPost, CollectionPostPage } from '@common/collections'

/**
 * The whole surface between the window and the Rust side. The window holds no keys, no
 * file access and no network: everything it can do is a command in `src-tauri/src/commands.rs`,
 * and every one of them is wrapped here once, typed.
 *
 * Writes answer `{ ok: true, … } | { ok: false, error }`; reads reject with a sentence.
 */

export type { Collection, CollectionPost, CollectionPostPage }

export type Outcome = { ok: true } | { ok: false; error: string }

export type Preferences = {
  /** Cores the compressor may use. */
  encodeThreads: number
  /** oxipng's preset, 0–6. */
  pngLevel: number
  /** Zopfli for PNG: a few percent smaller, many times slower. */
  zopfli: boolean
}

export type AppStatus = {
  /** False until a setup code has been entered on this machine. */
  configured: boolean
  siteUrl: string
  /** The host, never the URL — that carries a password. */
  databaseHost: string
  cdnUrl: string
  versions: { app: string; tauri: string; webview: string }
  /** A debug build, which keeps its own preferences, cache and log. */
  development: boolean
  limits: { maxFileSize: number; maxFileSizeLabel: string; maxPixels: number }
  cpu: { count: number }
  preferences: Preferences
  cache: { dir: string; images: number; bytes: number; collectionsReadAt: number | null }
}

/** A file the Rust side has looked at: within the limits, decodable, with a small preview. */
export type StagedFile = {
  ok: true
  path: string
  name: string
  size: number
  width: number
  height: number
  /** A small `data:` URL, or '' if the preview failed. */
  preview: string
  /** What the image would be named — and so the answer to "is this already up?". */
  md5: string
  /** The row already holding these bytes, and its shelf; null when new or unknown. */
  duplicateOf: number | null
  duplicateIn: string | null
}

export type StageOutcome = StagedFile | { ok: false; path: string; name: string; error: string }

export type UploadResult =
  | {
      ok: true
      postId: number
      originalSize: number
      storedSize: number
      rewritten: boolean
      /** One line: what the lossless pass tried and kept. */
      compression: string
    }
  | { ok: false; error: string }

/** One line of the activity log — something this copy did to the board, or tried to. */
export type LogEntry = {
  id: number
  at: string
  level: 'info' | 'error'
  /** `area:verb` — `collection:upload`. */
  action: string
  message: string
  detail?: Record<string, unknown>
}

/** `refId` is the web address segment; '' for none. */
type CollectionInput = { name: string; mark: string; refId: string }

type Named = { name: string; mark: string | null; ref_id: string | null }

export const api = {
  getStatus: () => invoke<AppStatus>('app_status'),
  savePreferences: (preferences: Preferences) =>
    invoke<Preferences>('save_preferences', { preferences }),

  /** Opens the OS picker. The paths chosen, empty if cancelled. */
  chooseFiles: () => invoke<string[]>('choose_files'),
  stageFiles: (paths: string[]) => invoke<StageOutcome[]>('stage_files', { paths }),
  /** Downloads pasted image links, then stages them like picked files. */
  fetchImages: (urls: string[]) => invoke<StageOutcome[]>('fetch_images', { urls }),

  /** Every shelf, cached for a day; `force` is 🔄 Refresh. */
  listCollections: (force = false) => invoke<Collection[]>('list_collections', { force }),
  createCollection: (input: CollectionInput) =>
    invoke<({ ok: true; id: string } & Named) | { ok: false; error: string }>(
      'create_collection',
      { input }
    ),
  editCollection: (id: string, input: CollectionInput) =>
    invoke<({ ok: true } & Named) | { ok: false; error: string }>(
      'edit_collection',
      { id, input }
    ),
  /** Refused while the shelf still holds anything. */
  deleteCollection: (id: string) => invoke<Outcome>('delete_collection', { id }),
  listCollectionPosts: (query: { collectionId: string; after?: number; perPage?: number }) =>
    invoke<CollectionPostPage>('list_collection_posts', { query }),
  uploadToCollection: (request: { collectionId: string; path: string; sourceUrl: string }) =>
    invoke<UploadResult>('upload_to_collection', { request }),
  saveCollectionPost: (request: { id: number; sourceUrl: string }) =>
    invoke<Outcome>('save_collection_post', { request }),
  moveCollectionPosts: (ids: number[], collectionId: string) =>
    invoke<{ ok: true; moved: number } | { ok: false; error: string }>('move_collection_posts', {
      ids,
      collectionId,
    }),
  /** The row and both stored objects. */
  deleteCollectionPost: (id: number) => invoke<Outcome>('delete_collection_post', { id }),

  /** Opens a setup code with its passphrase and, once the board answers, saves it as this
   *  machine's connection. Slow on purpose (scrypt): about a second. */
  setConnection: (code: string, passphrase: string) =>
    invoke<{ ok: true; databaseHost: string } | { ok: false; error: string }>('set_connection', {
      code,
      passphrase,
    }),
  /** Forgets this machine's connection; the window asks for a code again. */
  clearConnection: () => invoke<Outcome>('clear_connection'),

  listLogs: () => invoke<LogEntry[]>('list_logs'),
  clearLogs: () => invoke<void>('clear_logs'),
  clearCache: () => invoke<void>('clear_cache'),
  openExternal: (url: string) => invoke<void>('open_external', { url }).catch(() => {}),
  openDataFolder: () => invoke<void>('open_data_folder').catch(() => {}),

  /** Every log entry as it is written. Answers with the unsubscribe. */
  onLogEntry: (listener: (entry: LogEntry) => void): (() => void) => {
    const unlisten = listen<LogEntry>('activity:entry', (event) => listener(event.payload))
    return () => void unlisten.then((stop) => stop())
  },

  /**
   * Files dragged onto the window. Tauri takes the drop at the window level and hands over
   * real paths — an HTML drop event would carry only a `File` with no path on it.
   */
  onFileDrop: (handlers: {
    over: () => void
    leave: () => void
    drop: (paths: string[]) => void
  }): (() => void) => {
    const unlisten = getCurrentWebview().onDragDropEvent((event) => {
      const payload = event.payload
      if (payload.type === 'enter' || payload.type === 'over') handlers.over()
      else if (payload.type === 'leave') handlers.leave()
      else if (payload.type === 'drop') handlers.drop(payload.paths)
    })
    return () => void unlisten.then((stop) => stop())
  },
}

/** A read's rejection, as a sentence. */
export function failure(error: unknown): string {
  if (typeof error === 'string') return error
  if (error instanceof Error) return error.message
  return 'Something went wrong.'
}
