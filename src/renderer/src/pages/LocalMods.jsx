import { useState, useCallback } from 'react'

const TYPE_LABEL = { package: '.package', ts4script: '.ts4script', unknown: '?' }
const TYPE_COLOR = { package: 'bg-purple-700', ts4script: 'bg-blue-700', unknown: 'bg-gray-600' }

function formatBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function ModThumbnail({ absPath }) {
  const [url, setUrl] = useState(null)
  const [tried, setTried] = useState(false)

  // Lazy-resolve the file:// URL via preload on first render
  if (!tried && absPath) {
    setTried(true)
    window.api.getImageUrl(absPath).then(u => setUrl(u))
  }

  if (url) {
    return (
      <img
        src={url}
        alt="thumbnail"
        className="w-full h-32 object-cover rounded-t-lg"
        onError={() => setUrl(null)}
      />
    )
  }

  return (
    <div className="w-full h-32 rounded-t-lg bg-gray-800 flex items-center justify-center text-4xl select-none">
      📦
    </div>
  )
}

function ModCard({ mod }) {
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg overflow-hidden flex flex-col">
      <ModThumbnail absPath={mod.thumbnail?.path ?? null} />

      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-white font-semibold text-sm leading-tight truncate" title={mod.name}>
          {mod.name}
        </p>

        {mod.author && (
          <p className="text-purple-400 text-xs truncate" title={mod.author}>
            {mod.author}
          </p>
        )}

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <span className={`text-xs px-1.5 py-0.5 rounded font-mono ${TYPE_COLOR[mod.type]}`}>
            {TYPE_LABEL[mod.type]}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${mod.enabled ? 'bg-green-800 text-green-200' : 'bg-red-900 text-red-300'}`}>
            {mod.enabled ? 'enabled' : 'disabled'}
          </span>
        </div>

        <p className="text-gray-500 text-xs mt-1">{formatBytes(mod.size)}</p>

        <p className="text-gray-600 text-xs truncate mt-auto pt-1" title={mod.relativePath}>
          {mod.relativePath}
        </p>
      </div>
    </div>
  )
}

export default function LocalMods({ modsFolder }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)

  const scan = useCallback(async () => {
    setState('loading')
    setErrorMsg(null)
    try {
      const res = await window.api.scanLocalMods()
      if (!res.ok) {
        setErrorMsg(res.errors?.[0]?.message ?? 'Scan failed.')
        setState('error')
      } else {
        setResult(res)
        setState('done')
      }
    } catch (err) {
      setErrorMsg(err.message)
      setState('error')
    }
  }, [])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-8 py-5 border-b border-gray-800 shrink-0">
        <div>
          <h2 className="text-2xl font-bold text-white">Local Mods</h2>
          {modsFolder && (
            <p className="text-gray-500 text-xs mt-0.5 truncate max-w-lg" title={modsFolder}>
              {modsFolder}
            </p>
          )}
        </div>

        <button
          onClick={scan}
          disabled={state === 'loading'}
          className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {state === 'loading' ? (
            <>
              <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              Scanning…
            </>
          ) : (
            <>🔍 {state === 'done' ? 'Refresh' : 'Scan Mods'}</>
          )}
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">

        {/* Error */}
        {state === 'error' && (
          <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Scan errors (partial) */}
        {state === 'done' && result?.errors?.length > 0 && (
          <div className="mb-4 px-4 py-3 bg-yellow-900/30 border border-yellow-700 rounded-lg text-yellow-300 text-xs">
            {result.errors.length} file(s) had errors during scan.
          </div>
        )}

        {/* Idle */}
        {state === 'idle' && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <span className="text-5xl">📂</span>
            <p className="text-sm">Press <strong className="text-gray-400">Scan Mods</strong> to load your local mods.</p>
          </div>
        )}

        {/* Loading */}
        {state === 'loading' && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-3">
            <span className="animate-spin text-4xl inline-block w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full" />
            <p className="text-sm">Scanning mods folder…</p>
          </div>
        )}

        {/* Empty */}
        {state === 'done' && result?.count === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <span className="text-5xl">🗂️</span>
            <p className="text-sm">No mods found in this folder.</p>
          </div>
        )}

        {/* Results */}
        {state === 'done' && result?.count > 0 && (
          <>
            <p className="text-gray-500 text-xs mb-4">
              {result.count} mod{result.count !== 1 ? 's' : ''} found
              {' · '}scanned {new Date(result.scannedAt).toLocaleTimeString()}
            </p>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
              {result.mods.map(mod => (
                <ModCard key={mod.id} mod={mod} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
