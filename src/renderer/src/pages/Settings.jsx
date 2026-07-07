import { useState, useEffect } from 'react'

function ApiKeySection() {
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState(null) // null | 'saving' | 'saved'

  useEffect(() => {
    window.api.getConfig().then(cfg => setKey(cfg?.curseForgeApiKey ?? ''))
  }, [])

  const onSave = async () => {
    setStatus('saving')
    try {
      await window.api.setConfig('curseForgeApiKey', key.trim() || null)
      setStatus('saved')
      setTimeout(() => setStatus(null), 2500)
    } catch {
      setStatus(null)
    }
  }

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        CurseForge API Key
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-3 leading-relaxed">
          Needed to browse and download mods. Get a free key at{' '}
          <button
            onClick={() => window.api.openExternal('https://console.curseforge.com/')}
            className="text-violet-300 underline hover:text-violet-200"
          >
            console.curseforge.com
          </button>
          . A key in a <code className="text-violet-300 bg-white/5 px-1 rounded">.env</code> file takes precedence over this one.
        </p>
        <div className="flex items-center gap-2">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="$2a$10$…"
            className="input flex-1 px-3 py-2 font-mono text-xs"
          />
          <button onClick={() => setShow(s => !s)} className="btn-ghost px-3 py-2 text-sm" title={show ? 'Hide' : 'Show'}>
            {show ? '🙈' : '👁'}
          </button>
          <button onClick={onSave} disabled={status === 'saving'} className="btn-primary px-4 py-2 text-sm">
            {status === 'saving' ? 'Saving…' : status === 'saved' ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>
    </section>
  )
}

const PROVIDER_ICON = { patreon: '🧡', pinterest: '📌' }

function ConnectedAccountsSection() {
  const [status, setStatus] = useState({})
  const [busy, setBusy] = useState(null)

  const refresh = () => window.api.getAuthStatus?.().then(s => setStatus(s ?? {}))
  useEffect(() => { refresh() }, [])

  const connect = async (provider) => {
    setBusy(provider)
    try {
      await window.api.connectAccount(provider) // opens the real login window
      await refresh()
    } finally {
      setBusy(null)
    }
  }
  const disconnect = async (provider) => {
    setBusy(provider)
    try {
      await window.api.disconnectAccount(provider)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Connected Accounts
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-4 leading-relaxed">
          Sign in to your own accounts to download everything you have access to — including
          posts you back on Patreon. You log in on the real site in a normal window;
          <strong className="text-gray-300"> this app never sees your password</strong>.
        </p>
        <div className="flex flex-col gap-2">
          {Object.entries(status).map(([provider, s]) => (
            <div key={provider} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5">
              <span className="text-lg">{PROVIDER_ICON[provider] ?? '🌐'}</span>
              <span className="text-white text-sm font-medium">{s.label}</span>
              {s.connected
                ? <span className="badge bg-emerald-800/50 text-emerald-300">✓ connected</span>
                : <span className="badge bg-white/10 text-gray-400">not connected</span>}
              <div className="ml-auto">
                {s.connected ? (
                  <button onClick={() => disconnect(provider)} disabled={busy === provider} className="btn-ghost px-3 py-1.5 text-xs">
                    {busy === provider ? '…' : 'Disconnect'}
                  </button>
                ) : (
                  <button onClick={() => connect(provider)} disabled={busy === provider} className="btn-primary px-3 py-1.5 text-xs">
                    {busy === provider ? 'Waiting for login…' : 'Connect'}
                  </button>
                )}
              </div>
            </div>
          ))}
          {Object.keys(status).length === 0 && (
            <p className="text-gray-600 text-xs">Loading…</p>
          )}
        </div>
      </div>
    </section>
  )
}

function ThumbCacheSection() {
  const [status, setStatus] = useState(null)

  const onClear = async () => {
    setStatus('clearing')
    const res = await window.api.clearThumbCache()
    setStatus(res?.ok ? 'cleared' : 'error')
    setTimeout(() => setStatus(null), 2500)
  }

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        Thumbnail Cache
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-3 leading-relaxed">
          Mod previews extracted from <code className="text-violet-300 bg-white/5 px-1 rounded">.package</code> files
          are cached on disk. Clear it if thumbnails look stale — they regenerate on the next scan.
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => window.api.openThumbCache()} className="btn-ghost px-4 py-2 text-sm">
            📂 Open cache folder
          </button>
          <button onClick={onClear} disabled={status === 'clearing'} className="btn-ghost px-4 py-2 text-sm">
            {status === 'clearing' ? 'Clearing…' : status === 'cleared' ? '✓ Cleared' : status === 'error' ? '⚠ Failed' : '🧹 Clear cache'}
          </button>
        </div>
      </div>
    </section>
  )
}

export default function Settings({ modsFolder, onFolderChanged }) {
  const [cacheStatus, setCacheStatus] = useState(null) // null | 'loading' | {success, msg}
  const [folderLoading, setFolderLoading] = useState(false)

  async function handleChangeFolder() {
    setFolderLoading(true)
    try {
      const folder = await window.api.selectFolder()
      if (!folder) { setFolderLoading(false); return }
      await window.api.setConfig('modsFolder', folder)
      onFolderChanged(folder)
    } catch (err) {
      console.error('Failed to change folder:', err)
    }
    setFolderLoading(false)
  }

  async function handleClearCache() {
    setCacheStatus('loading')
    const result = await window.api.clearGameCache()
    if (result.success) {
      setCacheStatus({
        success: true,
        msg: result.alreadyGone
          ? 'Cache file was already gone — nothing to delete.'
          : 'localthumbcache.package deleted successfully!'
      })
    } else {
      setCacheStatus({ success: false, msg: result.error })
    }
    // auto-clear status after 5s
    setTimeout(() => setCacheStatus(null), 5000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-white/5 shrink-0">
        <h2 className="page-title">Settings</h2>
        <p className="page-subtitle">Configure folders and maintenance actions</p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl">
        {/* Mods Folder */}
        <section className="mb-6 fade-in-up">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Mods Folder
          </h3>
          <div className="card p-5">
            <p className="text-xs text-gray-500 mb-1">Current path</p>
            <p className="text-gray-200 font-mono text-sm break-all mb-4">
              {modsFolder ?? <span className="text-red-400">Not configured</span>}
            </p>
            <button
              onClick={handleChangeFolder}
              disabled={folderLoading}
              className="btn-ghost py-2 px-4 text-sm"
            >
              {folderLoading ? 'Opening…' : '📁 Change Mods Folder'}
            </button>
          </div>
        </section>

        <ConnectedAccountsSection />
        <ApiKeySection />
        <ThumbCacheSection />

        {/* Game Cache */}
        <section className="fade-in-up">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Game Cache
          </h3>
          <div className="card p-5">
            <p className="text-gray-400 text-sm mb-4 leading-relaxed">
              Deletes <code className="text-violet-300 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">localthumbcache.package</code> from
              your Sims 4 folder. The game will regenerate it on next launch.
              Do this after installing or removing mods to fix thumbnail glitches.
            </p>
            <button
              onClick={handleClearCache}
              disabled={cacheStatus === 'loading' || !modsFolder}
              className="btn-danger py-2 px-5 text-sm font-semibold"
            >
              {cacheStatus === 'loading' ? '🗑️ Deleting…' : '🗑️ Clear Game Cache'}
            </button>

            {!modsFolder && (
              <p className="mt-3 text-amber-400 text-xs">
                Configure your Mods folder first.
              </p>
            )}

            {cacheStatus && cacheStatus !== 'loading' && (
              <div className={`mt-4 text-sm px-4 py-2 rounded-xl border ${
                cacheStatus.success
                  ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/60'
                  : 'text-red-300 bg-red-950/60 border-red-800/60'
              }`}>
                {cacheStatus.success ? '✅' : '❌'} {cacheStatus.msg}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
