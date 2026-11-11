import { api, type AppStatus } from '../api'

/** The one address that does not vary per install. */
const REPO_URL = 'https://github.com/phumoonlight/collecto'

/**
 * What version am I running, and what is this thing. Tauri and the webview sit beside the
 * app's own version because a rendering or a dialog bug is theirs as often as it is ours.
 */
export function About({ status }: { status: AppStatus }) {
  const { app, tauri, webview } = status.versions

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4 pt-8 pb-25">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Collecto</h1>
        <p className="mt-1 flex items-center gap-2 text-sm text-muted">
          Version {app}
          {/* Only on a debug build, which keeps its own preferences, cache and log. */}
          {status.development && (
            <span className="border border-[#ead084] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#ead084]">
              Development
            </span>
          )}
        </p>
      </div>

      <p className="text-sm text-muted">
        The site&rsquo;s collections, managed locally. Every image keeps its own format and is
        compressed losslessly here — CPU work that belongs on your machine rather than a serverless
        function. The images go to the board&rsquo;s bucket and the rows to its database, which is
        what the website reads.
      </p>

      <dl className="flex flex-col gap-2 text-sm">
        <Row label="Site">
          {status.siteUrl ? (
            <button
              type="button"
              onClick={() => void api.openExternal(status.siteUrl)}
              className="text-accent underline-offset-2 hover:underline"
            >
              {status.siteUrl}
            </button>
          ) : (
            <span className="text-muted">Not set — see Settings</span>
          )}
        </Row>
        <Row label="Source">
          <button
            type="button"
            onClick={() => void api.openExternal(REPO_URL)}
            className="text-accent underline-offset-2 hover:underline"
          >
            {REPO_URL.replace('https://', '')}
          </button>
        </Row>
        <Row label="Tauri">{tauri}</Row>
        <Row label="WebView">{webview || 'unknown'}</Row>
      </dl>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 border-b border-border pb-2">
      <dt className="w-28 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 break-all">{children}</dd>
    </div>
  )
}
