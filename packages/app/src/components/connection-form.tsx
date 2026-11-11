import { useState } from 'react'
import { api } from '../api'
import { BUTTON_SUBMIT } from './buttons'
import { FIELD } from './panel'

/**
 * The setup code and its passphrase — the whole of what this app asks for. The code is made by
 * `npm run app:code` on the machine that holds the board's environment file; it is opened here,
 * checked against the board, and kept in the OS credential store, so later starts ask for
 * nothing.
 */
export function ConnectionForm({ onConnected }: { onConnected: () => void }) {
  const [code, setCode] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function connect() {
    if (busy || code.trim() === '' || passphrase === '') return
    setBusy(true)
    setError(null)
    const result = await api.setConnection(code, passphrase)
    setBusy(false)
    if (!result.ok) {
      setError(result.error)
      return
    }
    setCode('')
    setPassphrase('')
    onConnected()
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void connect()
      }}
      className="flex flex-col gap-3"
    >
      <label className="flex flex-col gap-1.5 text-sm">
        Setup code
        <textarea
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="collecto2.…"
          rows={4}
          spellCheck={false}
          autoComplete="off"
          className={`${FIELD} resize-none py-2 font-mono text-xs break-all`}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm">
        Passphrase
        <input
          type="password"
          value={passphrase}
          onChange={(event) => setPassphrase(event.target.value)}
          autoComplete="off"
          className={FIELD}
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={busy || code.trim() === '' || passphrase === ''}
          className={BUTTON_SUBMIT}
        >
          <span aria-hidden>🔌</span> {busy ? 'Connecting…' : 'Connect'}
        </button>
        {error && <p className="text-sm text-[#ff5d5f]">{error}</p>}
      </div>
      <p className="text-xs text-muted">
        Make a code with <code>npm run app:code</code> in the project. It is opened with the
        passphrase, checked against the database, then kept in Windows Credential Manager — this
        machine will not ask again.
      </p>
    </form>
  )
}
