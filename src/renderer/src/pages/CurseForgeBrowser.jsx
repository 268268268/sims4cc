import { useState, useEffect, useRef, useCallback } from 'react'

const DEBOUNCE_MS = 500
const SKELETON_COUNT = 10
const PAGE_SIZE = 50

const PLACEHOLDER_THUMB =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="50%" font-size="40" text-anchor="middle" dy=".35em" fill="#4b5563">📦</text></svg>'
  )

function getThumbnail(mod) {
  return mod?.logo?.thumbnailUrl || PLACEHOLDER_THUMB
}

function getAuthor(mod) {
  return mod?.authors?.[0]?.name || 'Unknown'
}

function SkeletonCard() {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col animate-pulse">
      <div className="w-full h-32 bg-gray-800" />
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="h-4 w-3/4 bg-gray-800 rounded" />
        <div className="h-3 w-1/3 bg-gray-800 rounded" />
        <div className="h-3 w-full bg-gray-800 rounded mt-1" />
        <div className="h-3 w-5/6 bg-gray-800 rounded" />
        <div className="h-8 w-full bg-gray-800 rounded mt-3" />
      </div>
    </div>
  )
}

function ModCard({ mod }) {
  // ponytail: per-card download state — idle | downloading | done | error
  const [dlState, setDlState] = useState('idle')

  const onDownload = async () => {
    if (dlState === 'downloading' || dlState === 'done') return
    setDlState('downloading')
    try {
      const res = await window.api.downloadCurseForgeMod(mod)
      if (res?.ok) {
        setDlState('done')
      } else {
        console.error('[CurseForge] Download failed:', res?.error)
        setDlState('error')
      }
    } catch (err) {
      console.error('[CurseForge] Download threw:', err)
      setDlState('error')
    }
  }

  const label =
    dlState === 'downloading'
      ? '⏳ Downloading…'
      : dlState === 'done'
        ? '✓ Downloaded!'
        : dlState === 'error'
          ? '⚠ Failed — retry'
          : '⬇ Download'

  const baseClass =
    'mt-3 px-3 py-1.5 text-xs font-medium rounded text-white transition-colors '
  const stateClass =
    dlState === 'downloading'
      ? 'bg-gray-700 cursor-wait'
      : dlState === 'done'
        ? 'bg-green-700 cursor-default'
        : dlState === 'error'
          ? 'bg-red-700 hover:bg-red-600'
          : 'bg-purple-600 hover:bg-purple-500'

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-lg overflow-hidden flex flex-col transition-colors hover:border-purple-600/60 hover:bg-gray-800/60">
      <img
        src={getThumbnail(mod)}
        alt={mod.name}
        loading="lazy"
        className="w-full h-32 object-cover bg-gray-800"
      />
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-white font-semibold text-sm leading-tight line-clamp-2" title={mod.name}>
          {mod.name}
        </p>
        <p className="text-purple-400 text-xs truncate" title={getAuthor(mod)}>
          {getAuthor(mod)}
        </p>
        {mod.summary && (
          <p className="text-gray-500 text-xs leading-snug line-clamp-3 mt-1" title={mod.summary}>
            {mod.summary}
          </p>
        )}
        <button
          onClick={onDownload}
          disabled={dlState === 'downloading' || dlState === 'done'}
          className={baseClass + stateClass}
        >
          {label}
        </button>
      </div>
    </div>
  )
}

export default function CurseForgeBrowser() {
  const [searchQuery, setSearchQuery] = useState('')
  const [mods, setMods] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isError, setIsError] = useState(false)

  // ponytail: track latest in-flight request so stale results don't overwrite newer ones
  const reqIdRef = useRef(0)
  const timerRef = useRef(null)

  const fetchMods = (filter) => {
    const reqId = ++reqIdRef.current
    setIsLoading(true)
    setIsError(false)
    window.api
      .searchCurseForge({ searchFilter: filter })
      .then(res => {
        if (reqId !== reqIdRef.current) return
        if (res?.error) {
          setIsError(true)
          setMods([])
        } else {
          setMods(res?.data ?? [])
        }
      })
      .catch(() => {
        if (reqId !== reqIdRef.current) return
        setIsError(true)
        setMods([])
      })
      .finally(() => {
        if (reqId === reqIdRef.current) setIsLoading(false)
      })
  }

  // Load popular mods on mount
  useEffect(() => {
    fetchMods('')
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // Debounced search while typing
  const onSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchMods(value), DEBOUNCE_MS)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 border-b border-gray-800">
        <div className="mb-3">
          <h2 className="text-2xl font-bold text-white">CurseForge</h2>
          <p className="text-gray-500 text-xs mt-0.5">Browse and download Sims 4 mods from CurseForge</p>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search mods…"
            className="w-full max-w-md bg-gray-900 border border-gray-700 focus:border-purple-600 focus:outline-none rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder-gray-600 transition-colors"
          />
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isError && (
          <div className="mb-4 px-4 py-3 bg-red-900/40 border border-red-700 rounded-lg text-red-300 text-sm">
            ⚠️ Failed to fetch mods from CurseForge. Check your API key and network connection.
          </div>
        )}

        {isLoading && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {!isLoading && !isError && mods.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <span className="text-5xl">🔍</span>
            <p className="text-sm">No mods found{searchQuery ? ` for "${searchQuery}"` : ''}.</p>
          </div>
        )}

        {!isLoading && !isError && mods.length > 0 && (
          <>
            <p className="text-gray-500 text-xs mb-4">
              {mods.length} mod{mods.length !== 1 ? 's' : ''}
              {searchQuery && ` · results for "${searchQuery}"`}
            </p>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
            >
              {mods.map(mod => (
                <ModCard key={mod.id ?? mod.name} mod={mod} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

