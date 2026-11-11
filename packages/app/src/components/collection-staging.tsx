import { useCallback, useState } from 'react'
import { api, type StagedFile, type StageOutcome } from '../api'
import { bytes } from '../image-url'
import { BUTTON_ON_SURFACE, BUTTON_SUBMIT_ON_SURFACE } from './buttons'
import { FIELD } from './panel'

/** What happened to one file once Upload was pressed. */
type Landed = { name: string; ok: boolean; message: string }

/** Every http(s) link in what was pasted, one per line or separated by spaces. */
function linksIn(text: string): string[] {
  return [...new Set(text.split(/\s+/).filter((part) => /^https?:\/\/\S+$/i.test(part)))]
}

/**
 * Everything about putting images on a shelf: what has been staged, what was refused, the
 * batch's source, and the upload itself. A hook and a box rather than one component, because
 * the drop target is the whole window and the files have to reach the batch assembled here.
 *
 * **A batch carries one source** — the images that arrive together are usually the four in
 * one post. It is cleared with the batch once it lands, so the next batch does not quietly
 * get the last post's address.
 */
export function useStaging(collectionId: string, onUploaded: () => void) {
  const [staged, setStaged] = useState<StagedFile[]>([])
  const [rejected, setRejected] = useState<string[]>([])
  const [landed, setLanded] = useState<Landed[]>([])
  const [source, setSource] = useState('')
  const [working, setWorking] = useState<string | null>(null)

  /** Sorts what a picker, a drop or a link produced into "can be uploaded" and "why not" —
   *  a duplicate names the shelf it is already on. */
  const absorb = useCallback((outcomes: StageOutcome[]) => {
    const ready: StagedFile[] = []
    const refused: string[] = []
    for (const outcome of outcomes) {
      if (!outcome.ok) refused.push(`${outcome.name}: ${outcome.error}`)
      else if (outcome.duplicateOf !== null)
        refused.push(`${outcome.name}: already in ${outcome.duplicateIn ?? 'another collection'}`)
      else ready.push(outcome)
    }
    // The same file dropped twice is one image, and the md5 says so before anything uploads.
    setStaged((current) => [
      ...current,
      ...ready.filter((next) => !current.some((held) => held.md5 === next.md5)),
    ])
    setRejected(refused)
    setLanded([])
  }, [])

  const stage = useCallback(
    async (paths: string[]) => {
      if (paths.length === 0) return
      setWorking(`Reading ${paths.length} image${paths.length === 1 ? '' : 's'}…`)
      try {
        absorb(await api.stageFiles(paths))
      } finally {
        setWorking(null)
      }
    },
    [absorb]
  )

  const stageLinks = useCallback(
    async (urls: string[]) => {
      if (urls.length === 0) return
      setWorking(`Downloading ${urls.length} image${urls.length === 1 ? '' : 's'}…`)
      try {
        absorb(await api.fetchImages(urls))
      } finally {
        setWorking(null)
      }
    },
    [absorb]
  )

  /**
   * Uploads the batch, one file at a time and in order: each is a full lossless pass that
   * already spreads across the cores it is allowed, so running several at once would only
   * make the first finish later. Each answer is kept, so a failure mid-batch is a line beside
   * that file rather than the end of the run.
   */
  async function upload() {
    if (staged.length === 0) return
    const results: Landed[] = []
    for (const [at, file] of staged.entries()) {
      setWorking(`Compressing and uploading ${at + 1} of ${staged.length}…`)
      const result = await api.uploadToCollection({
        collectionId,
        path: file.path,
        sourceUrl: source.trim(),
      })
      results.push(
        result.ok
          ? {
              name: file.name,
              ok: true,
              message: `added as #${result.postId} — ${
                result.rewritten
                  ? `${bytes(result.originalSize)} → ${bytes(result.storedSize)}, lossless`
                  : `${bytes(result.storedSize)}, stored as uploaded`
              }`,
            }
          : { name: file.name, ok: false, message: result.error }
      )
    }
    setWorking(null)
    setStaged([])
    setSource('')
    setLanded(results)
    onUploaded()
  }

  return { staged, setStaged, rejected, landed, source, setSource, working, stage, stageLinks, upload }
}

type Staging = ReturnType<typeof useStaging>

/** The drop zone and the batch under it: files, pasted links, one source. */
export function StagingBox({
  staging,
  name,
  dragging,
}: {
  staging: Staging
  /** The shelf's name, which the Upload button says out loud. */
  name: string
  dragging: boolean
}) {
  const { staged, setStaged, rejected, landed, source, setSource, working } = staging
  const [links, setLinks] = useState('')

  return (
    <div
      className={`flex flex-col gap-3 border-2 border-dashed px-4 py-4 ${
        dragging ? 'border-accent bg-accent/10' : 'border-border bg-surface'
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void api.chooseFiles().then(staging.stage)}
          disabled={working !== null}
          className={BUTTON_ON_SURFACE}
        >
          <span aria-hidden>📥</span> Add images
        </button>
        <span className="text-xs text-muted">
          or drop them anywhere on the window — JPG, PNG, GIF or WebP, kept in their own format
          and compressed losslessly
        </span>
      </div>

      {/* Images from a web page arrive as links: pasted here, fetched, then staged. */}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          const urls = linksIn(links)
          if (urls.length === 0) return
          setLinks('')
          void staging.stageLinks(urls)
        }}
        className="flex items-center gap-2 text-xs text-muted"
      >
        Links
        <input
          value={links}
          onChange={(event) => setLinks(event.target.value)}
          placeholder="https://… image addresses, separated by spaces"
          spellCheck={false}
          className={`${FIELD} min-w-0 flex-1 bg-background`}
        />
        <button
          type="submit"
          disabled={working !== null || linksIn(links).length === 0}
          className={BUTTON_ON_SURFACE}
        >
          <span aria-hidden>🔗</span> Fetch
        </button>
      </form>

      <label className="flex items-center gap-2 text-xs text-muted">
        Source
        <input
          value={source}
          onChange={(event) => setSource(event.target.value)}
          placeholder="https://x.com/… — applied to every image in this batch"
          spellCheck={false}
          className={`${FIELD} min-w-0 flex-1 bg-background`}
        />
        {source !== '' && (
          <button
            type="button"
            onClick={() => setSource('')}
            title="Clear the source"
            aria-label="Clear the source"
            className={BUTTON_ON_SURFACE}
          >
            <span aria-hidden>✕</span>
          </button>
        )}
      </label>

      {working && <p className="text-xs text-muted">{working}</p>}

      {staged.length > 0 && (
        <>
          <ul className="flex flex-wrap gap-2">
            {staged.map((file) => (
              <li key={file.md5} className="relative">
                {file.preview ? (
                  <img
                    src={file.preview}
                    alt=""
                    title={`${file.name} — ${file.width}×${file.height}, ${bytes(file.size)}`}
                    className="size-20 bg-background object-cover"
                  />
                ) : (
                  <span
                    title={file.name}
                    className="grid size-20 place-items-center bg-background text-xs text-muted"
                  >
                    {file.width}×{file.height}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() =>
                    setStaged((current) => current.filter((held) => held.md5 !== file.md5))
                  }
                  title={`Leave out ${file.name}`}
                  aria-label={`Leave out ${file.name}`}
                  className="absolute right-0 top-0 bg-background/80 px-1 text-xs"
                >
                  <span aria-hidden>✕</span>
                </button>
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void staging.upload()}
              disabled={working !== null}
              className={BUTTON_SUBMIT_ON_SURFACE}
            >
              <span aria-hidden>⬆️</span> Upload {staged.length} to {name}
            </button>
            <button
              type="button"
              onClick={() => setStaged([])}
              disabled={working !== null}
              className={BUTTON_ON_SURFACE}
            >
              <span aria-hidden>🧹</span> Clear
            </button>
          </div>
        </>
      )}

      {rejected.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs text-[#ff5d5f]">
          {rejected.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {landed.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-xs">
          {landed.map((result, at) => (
            <li key={`${at}:${result.name}`} className={result.ok ? 'text-muted' : 'text-[#ff5d5f]'}>
              {result.name}: {result.message}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
