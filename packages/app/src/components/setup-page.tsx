import type { AppStatus } from '../api'
import { ConnectionForm } from './connection-form'

/**
 * The whole window until this machine has a connection — no header, no screens behind it,
 * since none of them can do anything without a board. Once the code is accepted, `onConnected`
 * re-reads the status and the window opens on the collections.
 */
export function SetupPage({ status, onConnected }: { status: AppStatus; onConnected: () => void }) {
  return (
    <div className="grid h-screen place-items-center overflow-y-auto px-4 py-10">
      <div className="flex w-full max-w-lg flex-col gap-6">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <span aria-hidden>🗂️</span> Collecto
          </h1>
          <p className="text-sm text-muted">
            Connect this machine to your board. Paste the setup code from{' '}
            <code>npm run app:code</code> and type its passphrase — once; it is kept in Windows
            Credential Manager after that.
          </p>
        </div>

        <section className="border border-border bg-surface px-4 py-4">
          <ConnectionForm onConnected={onConnected} />
        </section>

        <p className="text-center text-xs text-muted">
          Version {status.versions.app}
          {status.development && ' · development build'}
        </p>
      </div>
    </div>
  )
}
