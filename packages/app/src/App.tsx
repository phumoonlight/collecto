import { useCallback, useEffect, useState } from 'react'
import { About } from './components/about'
import { Collections } from './components/collections'
import { Logs } from './components/logs'
import { Notices } from './components/notices'
import { Settings } from './components/settings'
import { SetupPage } from './components/setup-page'
import { api, type AppStatus } from './api'

type View = 'collections' | 'logs' | 'settings' | 'about'

/**
 * Four screens. There is no login: which board this copy talks to is set once per machine
 * from a setup code (Settings), and kept in the OS credential store. The window opens on the
 * collections; until that code has been entered the window is the setup page alone
 * (`SetupPage`), since no screen can do anything without a board.
 */
export function App() {
  const [status, setStatus] = useState<AppStatus | null>(null)
  const [view, setView] = useState<View>('collections')

  const refresh = useCallback(async () => {
    setStatus(await api.getStatus())
  }, [])

  useEffect(() => {
    let alive = true
    void api.getStatus().then((next) => {
      if (alive) setStatus(next)
    })
    return () => {
      alive = false
    }
  }, [])

  if (!status) {
    return <div className="grid h-screen place-items-center text-sm text-muted">Starting…</div>
  }

  if (!status.configured) {
    return (
      <>
        {/* A fresh window once connected: nothing from before the connection survives. */}
        <SetupPage status={status} onConnected={() => window.location.reload()} />
        <Notices />
      </>
    )
  }

  // The current item reads as a tab: a bar on the header's own border, not an underline.
  const ACTIVE_BAR =
    'relative after:absolute after:inset-x-0 after:-bottom-2 after:h-0.5 after:bg-accent'

  const navClass = (active: boolean) =>
    `flex items-center gap-1 text-xs transition-colors ${
      active ? `text-foreground ${ACTIVE_BAR}` : 'text-muted hover:text-foreground'
    }`

  const screen =
    view === 'about' ? (
      <About status={status} />
    ) : view === 'settings' ? (
      <Settings status={status} onChanged={() => void refresh()} />
    ) : view === 'collections' ? (
      <Collections siteUrl={status.siteUrl} />
    ) : (
      <Logs />
    )

  const go = (target: View) => () => setView(target)

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          {/* The site itself, in the corner the website's wordmark occupies — never drawn
              active, since it opens in the browser. */}
          {status.siteUrl ? (
            <button
              type="button"
              onClick={() => void api.openExternal(`${status.siteUrl}/posts`)}
              title="Open the site in your browser"
              className="flex items-center gap-1.5 text-sm font-bold tracking-tight text-muted transition-colors hover:text-foreground"
            >
              <span aria-hidden>🖼️</span>
              Open site
            </button>
          ) : (
            <span />
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={go('collections')}
            title="The collections the site shows"
            className={navClass(view === 'collections')}
          >
            <span aria-hidden>🗂️</span>
            Collections
          </button>
          <button type="button" onClick={go('logs')} className={navClass(view === 'logs')}>
            <span aria-hidden>📜</span>
            Logs
          </button>
          <button type="button" onClick={go('about')} className={navClass(view === 'about')}>
            <span aria-hidden>ℹ️</span>
            About
          </button>
          <button type="button" onClick={go('settings')} className={navClass(view === 'settings')}>
            <span aria-hidden>⚙️</span>
            Settings
          </button>
        </div>
      </header>

      {/* The frame never scrolls; the screen inside it does. Every screen carries `pb-25`,
          so the last row is followed by room rather than the window's edge. */}
      <main className="min-h-0 flex-1 overflow-y-auto">{screen}</main>
      <Notices />
    </div>
  )
}
