import { useState, useEffect, useRef, useCallback } from 'react'
import DownloadButton from '../components/DownloadButton'
import CurseForgeModDetail from '../components/CurseForgeModDetail'
import { formatBytes, formatCount } from '../lib/format'

const DEBOUNCE_MS = 500
const SKELETON_COUNT = 10
const PAGE_SIZE = 50
// ponytail: CurseForge hard-caps index + pageSize at 10 000 — requests beyond that 400
const MAX_RESULT_WINDOW = 10000

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
    <div className="card flex flex-col">
      <div className="w-full h-32 skeleton" />
      <div className="p-3 flex flex-col gap-2 flex-1">
        <div className="h-4 w-3/4 skeleton rounded" />
        <div className="h-3 w-1/3 skeleton rounded" />
        <div className="h-3 w-full skeleton rounded mt-1" />
        <div className="h-3 w-5/6 skeleton rounded" />
        <div className="h-8 w-full skeleton rounded mt-3" />
      </div>
    </div>
  )
}

function ModCard({ mod, installed, onInstalled, onOpen }) {
  const size = formatBytes(mod.latestFiles?.[0]?.fileLength)
  const downloads = formatCount(mod.downloadCount)

  return (
    <div
      onClick={() => onOpen(mod)}
      className={`card card-hover fade-in-up flex flex-col cursor-pointer ${installed ? 'ring-1 ring-emerald-500/40' : ''}`}
      title="Click for details"
    >
      <div className="relative">
        <img
          src={getThumbnail(mod)}
          alt={mod.name}
          loading="lazy"
          className="w-full h-32 object-cover bg-[#181b2a]"
        />
        {installed && (
          <span className="absolute top-2 right-2 badge bg-emerald-600/90 text-white shadow-md shadow-emerald-950/40 backdrop-blur-sm">
            ✓ Installed
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-white font-semibold text-sm leading-tight line-clamp-2" title={mod.name}>
          {mod.name}
        </p>
        <p className="text-violet-400 text-xs truncate" title={getAuthor(mod)}>
          {getAuthor(mod)}
        </p>
        {mod.summary && (
          <p className="text-gray-500 text-xs leading-snug line-clamp-3 mt-1" title={mod.summary}>
            {mod.summary}
          </p>
        )}
        {(size || downloads) && (
          <div className="flex items-center gap-3 mt-1 text-gray-500 text-[11px]">
            {downloads && <span title={`${mod.downloadCount?.toLocaleString()} downloads`}>⬇ {downloads}</span>}
            {size && <span title="File size">💾 {size}</span>}
          </div>
        )}
        <DownloadButton
          mod={mod}
          installed={installed}
          onInstalled={onInstalled}
          className="mt-3 px-3 py-1.5 text-xs"
        />
      </div>
    </div>
  )
}

export default function CurseForgeBrowser() {
  const [searchQuery, setSearchQuery] = useState('')
  // filter the displayed list was actually fetched with — searchQuery changes on
  // every keystroke and would mislabel results during the debounce window
  const [displayedFilter, setDisplayedFilter] = useState('')
  const [mods, setMods] = useState([])
  const [pageIndex, setPageIndex] = useState(0)
  const [totalCount, setTotalCount] = useState(null)
  const [hasMore, setHasMore] = useState(true)
  const [isLoading, setIsLoading] = useState(true) // page 0 (replace) in flight
  const [isLoadingMore, setIsLoadingMore] = useState(false) // page N (append) in flight
  const [isError, setIsError] = useState(false) // page-0 fetch failed
  const [loadMoreFailed, setLoadMoreFailed] = useState(false) // append fetch failed
  // ids of mods already downloaded (persisted across restarts, self-healing on delete)
  const [downloadedIds, setDownloadedIds] = useState(() => new Set())
  const [selectedMod, setSelectedMod] = useState(null) // detail modal target

  // ponytail: track latest in-flight request so stale results don't overwrite newer ones
  const reqIdRef = useRef(0)
  const timerRef = useRef(null)
  // filter the current mod list was fetched with — pagination must follow this,
  // not searchQuery, which changes on every keystroke before the debounce fires
  const activeFilterRef = useRef('')
  const scrollRootRef = useRef(null)
  const loadMoreRef = useRef(null)

  const fetchPage = useCallback((filter, page) => {
    const reqId = ++reqIdRef.current
    const append = page > 0
    if (append) {
      setIsLoadingMore(true)
      setLoadMoreFailed(false)
    } else {
      activeFilterRef.current = filter
      setIsLoading(true)
      // ponytail: a superseded in-flight append never reaches its own .finally
      // (reqId guard), so the new search must clear its flag or the observer
      // guard blocks every future append — permanent spinner, dead scroll
      setIsLoadingMore(false)
      setIsError(false)
      setLoadMoreFailed(false)
      setHasMore(true)
    }
    window.api
      .searchCurseForge({ searchFilter: filter, index: page * PAGE_SIZE, pageSize: PAGE_SIZE })
      .then(res => {
        if (reqId !== reqIdRef.current) return
        if (res?.error) {
          if (append) {
            setLoadMoreFailed(true)
          } else {
            setIsError(true)
            setMods([])
          }
          return
        }
        const newMods = res?.data ?? []
        const total = res?.pagination?.totalCount ?? null
        setPageIndex(page)
        setTotalCount(total)
        if (!append) setDisplayedFilter(filter)
        setMods(prev => {
          if (!append) return newMods
          // ponytail: CurseForge's default sort isn't perfectly stable across pages —
          // dedupe by id so React keys stay unique
          const seen = new Set(prev.map(m => m.id))
          return [...prev, ...newMods.filter(m => !seen.has(m.id))]
        })
        const nextIndex = (page + 1) * PAGE_SIZE
        setHasMore(
          newMods.length === PAGE_SIZE &&
          nextIndex + PAGE_SIZE <= MAX_RESULT_WINDOW &&
          (total == null || nextIndex < total)
        )
      })
      .catch(() => {
        if (reqId !== reqIdRef.current) return
        if (append) {
          setLoadMoreFailed(true)
        } else {
          setIsError(true)
          setMods([])
        }
      })
      .finally(() => {
        if (reqId !== reqIdRef.current) return
        if (append) setIsLoadingMore(false)
        else setIsLoading(false)
      })
  }, [])

  // Load popular mods on mount
  useEffect(() => {
    fetchPage('', 0)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [fetchPage])

  // Load the "already downloaded" set on mount so cards can show the Installed
  // badge. Re-fetched whenever the page mounts, so deletes in Local Mods reflect.
  useEffect(() => {
    let cancelled = false
    window.api.getDownloadedCurseForge?.().then(rec => {
      if (!cancelled && rec) setDownloadedIds(new Set(Object.keys(rec).map(Number)))
    })
    return () => { cancelled = true }
  }, [])

  const markInstalled = useCallback((id) => {
    setDownloadedIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  // Debounced search while typing — a new search always restarts from page 0
  const onSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => fetchPage(value, 0), DEBOUNCE_MS)
  }

  // Infinite scroll: observe the bottom marker; when it enters the (pre-extended)
  // viewport of the scroll container, fetch the next page and append.
  useEffect(() => {
    const node = loadMoreRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (isLoading || isLoadingMore || isError || loadMoreFailed || !hasMore) return
        fetchPage(activeFilterRef.current, pageIndex + 1)
      },
      // ponytail: 300px rootMargin prefetches the next page just before the user
      // reaches the bottom, so scrolling feels continuous
      { root: scrollRootRef.current, rootMargin: '300px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
    // mods.length re-attaches the observer when the marker (re)mounts with the grid
  }, [pageIndex, isLoading, isLoadingMore, hasMore, isError, loadMoreFailed, mods.length, fetchPage])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 border-b border-white/5">
        <div className="mb-3">
          <h2 className="page-title">CurseForge</h2>
          <p className="page-subtitle">Browse and download Sims 4 mods from CurseForge</p>
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">🔍</span>
          <input
            type="text"
            value={searchQuery}
            onChange={onSearchChange}
            placeholder="Search mods…"
            className="input w-full max-w-md pl-9 pr-3 py-2"
          />
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRootRef} className="flex-1 overflow-y-auto px-8 py-6">
        {isError && (
          <div className="mb-4 banner-error">
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
            <p className="text-sm">No mods found{displayedFilter ? ` for "${displayedFilter}"` : ''}.</p>
          </div>
        )}

        {!isLoading && !isError && mods.length > 0 && (
          <>
            <p className="text-gray-500 text-xs mb-4">
              {totalCount != null && totalCount > mods.length
                ? `Showing ${mods.length.toLocaleString()} of ${totalCount.toLocaleString()} mods`
                : `${mods.length.toLocaleString()} mod${mods.length !== 1 ? 's' : ''}`}
              {displayedFilter && ` · results for "${displayedFilter}"`}
              {(() => {
                const n = mods.reduce((c, m) => c + (downloadedIds.has(m.id) ? 1 : 0), 0)
                return n > 0 ? <span className="text-emerald-400"> · {n} installed</span> : null
              })()}
            </p>
            <div
              className="grid gap-4"
              style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
            >
              {mods.map(mod => (
                <ModCard
                  key={mod.id ?? mod.name}
                  mod={mod}
                  installed={downloadedIds.has(mod.id)}
                  onInstalled={markInstalled}
                  onOpen={setSelectedMod}
                />
              ))}
            </div>

            {/* Infinite-scroll bottom marker + status row */}
            <div id="load-more-trigger" ref={loadMoreRef} className="h-px" />
            {isLoadingMore && (
              <div className="flex items-center justify-center gap-2 py-6 text-gray-500 text-xs">
                <span className="inline-block w-4 h-4 border-2 border-violet-500 border-t-transparent rounded-full animate-spin" />
                Loading more mods…
              </div>
            )}
            {loadMoreFailed && (
              <div className="flex flex-col items-center gap-2 py-6">
                <p className="text-red-400 text-xs">⚠️ Failed to load more mods.</p>
                <button
                  onClick={() => fetchPage(activeFilterRef.current, pageIndex + 1)}
                  className="btn-danger px-3 py-1.5 text-xs"
                >
                  Retry
                </button>
              </div>
            )}
            {!hasMore && !isLoadingMore && !loadMoreFailed && (
              <p className="text-center text-gray-600 text-xs py-6">— End of results —</p>
            )}
          </>
        )}
      </div>

      {selectedMod && (
        <CurseForgeModDetail
          mod={selectedMod}
          installed={downloadedIds.has(selectedMod.id)}
          onInstalled={markInstalled}
          onClose={() => setSelectedMod(null)}
        />
      )}
    </div>
  )
}
