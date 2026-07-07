import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { formatRelative } from '../lib/format'
import { markChanged } from '../lib/sessionActivity'
import DiscoverDetail from '../components/DiscoverDetail'

const TYPE_META = {
  patreon: { icon: '🧡', badge: 'bg-orange-600/30 text-orange-200' },
  pinterest: { icon: '📌', badge: 'bg-red-600/30 text-red-200' },
  tumblr: { icon: '📝', badge: 'bg-sky-600/30 text-sky-200' },
  modthesims: { icon: '🏛', badge: 'bg-emerald-600/30 text-emerald-200' }
}

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="50%" font-size="40" text-anchor="middle" dy=".35em" fill="#4b5563">🌐</text></svg>'
  )

function AddSourceForm({ types, onAdded }) {
  const [type, setType] = useState('patreon')
  const [input, setInput] = useState('')
  const [state, setState] = useState('idle') // idle | adding
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null) // { added, results:[{input,ok,error}] } from a batch

  const hint = types.find(t => t.type === type)?.hint ?? ''
  // count tokens the same way the backend splits, so the button label matches
  const count = input.split(/[\s,;]+/).map(s => s.trim()).filter(Boolean).length

  const onAdd = async () => {
    const value = input.trim()
    if (!value || state === 'adding') return
    setState('adding')
    setError(null)
    setReport(null)
    try {
      // one endpoint handles 1..N — it splits names/URLs on spaces, commas, newlines
      const res = await window.api.followSourcesBatch({ type, text: value })
      if (res?.added > 0) {
        setInput('')
        onAdded()
      }
      if (res?.error) setError(res.error)
      else if (res?.results) setReport(res) // show per-creator outcome (incl. failures)
    } catch (err) {
      setError(err.message)
    } finally {
      setState('idle')
    }
  }

  const failed = report?.results?.filter(r => !r.ok) ?? []

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-start gap-2 flex-wrap">
        <select
          value={type}
          onChange={e => setType(e.target.value)}
          className="input px-2.5 py-2 text-sm bg-[#12141f]"
        >
          {types.map(t => (
            <option key={t.type} value={t.type}>{TYPE_META[t.type]?.icon} {t.label}</option>
          ))}
        </select>
        <div className="flex flex-col flex-1 min-w-[18rem]">
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) onAdd() }}
            placeholder={`${hint} — add several at once, separated by spaces, commas or new lines`}
            rows={2}
            className="input w-full px-3 py-2 text-sm resize-y"
          />
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>
        <button onClick={onAdd} disabled={state === 'adding'} className="btn-primary px-4 py-2 text-sm whitespace-nowrap">
          {state === 'adding' ? '⏳ Checking…' : `＋ Follow${count > 1 ? ` (${count})` : ''}`}
        </button>
      </div>
      {report && (
        <p className="text-xs">
          <span className="text-emerald-400">✓ Added {report.added}</span>
          {failed.length > 0 && (
            <span className="text-red-400 ml-2">
              ⚠ {failed.length} failed: {failed.map(f => `${f.input} (${f.error ?? 'error'})`).join(', ')}
            </span>
          )}
        </p>
      )}
    </div>
  )
}

function DiscoverDownloadButton({ item, installed = false, onDownloaded }) {
  const [state, setState] = useState(installed ? 'done' : 'idle') // idle | downloading | done | error
  const [progress, setProgress] = useState(null)

  // reflect the persisted "already downloaded" flag once it loads / changes
  useEffect(() => { if (installed) setState(s => (s === 'idle' ? 'done' : s)) }, [installed])

  useEffect(() => {
    if (state !== 'downloading') return
    const off = window.api.onDiscoverProgress?.((p) => {
      if (p.itemId === item.id) setProgress(p)
    })
    return () => off?.()
  }, [state, item.id])

  const onClick = async (e) => {
    e.stopPropagation()
    if (state === 'downloading' || state === 'done') return // already installed — no re-download
    setState('downloading')
    setProgress(null)
    try {
      const res = await window.api.downloadDiscoverItem(item)
      if (res?.ok) {
        setState('done')
        markChanged()
        onDownloaded?.(item)
        window.dispatchEvent(new CustomEvent('local-mods-changed'))
      } else {
        console.error('[Discover] download failed:', res?.error, res?.errors)
        setState('error')
      }
    } catch (err) {
      console.error('[Discover] download threw:', err)
      setState('error')
    }
  }

  const pct = progress?.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null
  const multi = (item.downloads?.length ?? 0) > 1 && progress?.fileCount > 1
  const label =
    state === 'downloading'
      ? progress?.phase === 'installing'
        ? '📦 Installing…'
        : `⏳ ${multi ? `${progress.fileIndex}/${progress.fileCount} · ` : ''}${pct != null ? `${pct}%` : '…'}`
      : state === 'done' ? '✓ Installed'
        : state === 'error' ? '⚠ Failed — retry'
          : `⬇ Download${item.downloads.length > 1 ? ` (${item.downloads.length})` : ''}`

  const cls =
    state === 'downloading' ? 'btn-ghost cursor-wait'
      : state === 'done' ? 'btn-success cursor-default'
        : state === 'error' ? 'btn-danger'
          : 'btn-primary'

  return (
    <button onClick={onClick} disabled={state === 'downloading' || state === 'done'} title={state === 'done' ? 'Already downloaded through the app' : undefined} className={`relative overflow-hidden ${cls} mt-2 px-3 py-1.5 text-xs`}>
      {label}
      {state === 'downloading' && pct != null && progress?.phase !== 'installing' && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-violet-400 transition-[width] duration-200" style={{ width: `${pct}%` }} />
      )}
    </button>
  )
}

function SuggestedCreators({ suggested, onFollow, busy }) {
  const [open, setOpen] = useState(false)
  const notFollowed = suggested.filter(s => !s.followed)
  if (!suggested.length) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <button
          onClick={() => setOpen(o => !o)}
          className="text-gray-400 hover:text-gray-200 text-xs flex items-center gap-1"
        >
          <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▶</span>
          ✨ Suggested creators — popular Sims 4 makers ({suggested.length})
        </button>
        {open && notFollowed.length > 0 && (
          <button onClick={() => onFollow(null)} disabled={busy} className="btn-primary px-3 py-1 text-xs">
            {busy ? 'Adding…' : `＋ Follow all (${notFollowed.length})`}
          </button>
        )}
      </div>
      {open && (
      <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
        {suggested.map(s => (
          <button
            key={`${s.type}:${s.input}`}
            onClick={() => !s.followed && onFollow([s])}
            disabled={s.followed || busy}
            className={`chip ${s.followed ? 'chip-active !cursor-default' : 'hover:border-violet-500/60'}`}
            title={s.tag}
          >
            {TYPE_META[s.type]?.icon} {s.label}
            {s.followed ? <span className="text-emerald-400 ml-0.5">✓</span> : <span className="text-violet-300 ml-0.5">＋</span>}
          </button>
        ))}
      </div>
      )}
    </div>
  )
}

function ItemCard({ item, onOpen, installed = false, onDownloaded }) {
  const meta = TYPE_META[item.sourceType] ?? { icon: '🌐', badge: 'bg-gray-700 text-gray-300' }
  const canDownload = (item.downloads?.length ?? 0) > 0
  return (
    <div
      onClick={() => onOpen(item)}
      className="card card-hover fade-in-up flex flex-col cursor-pointer"
      title="Click for details"
    >
      <div className="relative">
        <img
          src={item.imageUrl || PLACEHOLDER}
          alt={item.title}
          loading="lazy"
          className="w-full h-36 object-cover bg-[#181b2a]"
          onError={(e) => { e.currentTarget.src = PLACEHOLDER }}
        />
        <span className={`absolute top-2 left-2 badge ${meta.badge} backdrop-blur-sm`}>
          {meta.icon} {item.sourceType}
        </span>
        {item.locked ? (
          <span className="absolute top-2 right-2 badge bg-black/70 text-amber-300 backdrop-blur-sm" title="Patron-only post — opens on Patreon">
            🔒 patrons
          </span>
        ) : installed ? (
          <span className="absolute top-2 right-2 badge bg-emerald-500 text-white backdrop-blur-sm" title="Already downloaded through the app">
            ✓ installed
          </span>
        ) : canDownload && (
          <span className="absolute top-2 right-2 badge bg-emerald-600/80 text-white backdrop-blur-sm" title="Free files attached — installs directly">
            🆓 free
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-white font-semibold text-sm leading-tight line-clamp-2" title={item.title}>
          {item.title}
        </p>
        {item.author && <p className="text-violet-400 text-xs truncate">{item.author}</p>}
        {item.summary && (
          <p className="text-gray-500 text-xs leading-snug line-clamp-2">{item.summary}</p>
        )}
        <div className="flex items-center gap-2 mt-auto pt-1.5 text-gray-600 text-[11px]">
          {item.date && <span>🕒 {formatRelative(item.date)}</span>}
          <span className="ml-auto text-gray-500">↗ open</span>
        </div>
        {canDownload && <DiscoverDownloadButton item={item} installed={installed} onDownloaded={onDownloaded} />}
      </div>
    </div>
  )
}

export default function Discover() {
  const [types, setTypes] = useState([])
  const [data, setData] = useState(null) // { items, sources, fetchedAt }
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [sourceFilter, setSourceFilter] = useState('all')
  const [onlyFree, setOnlyFree] = useState(false)
  const [showManage, setShowManage] = useState(false)
  const [selected, setSelected] = useState(null) // detail modal target
  const [suggested, setSuggested] = useState([])
  const [followingAll, setFollowingAll] = useState(false)
  const [downloaded, setDownloaded] = useState(() => ({ ids: new Set(), files: new Set() }))

  const refreshDownloaded = useCallback(() => {
    window.api.getDownloadedDiscover?.().then(r =>
      setDownloaded({ ids: new Set(r?.ids ?? []), files: new Set(r?.files ?? []) })
    )
  }, [])

  // an item counts as installed if we downloaded this exact post, or every file it
  // offers was already downloaded (same mod re-posted elsewhere)
  const isInstalled = useCallback((item) => {
    if (downloaded.ids.has(item.id)) return true
    const dls = item.downloads ?? []
    return dls.length > 0 && dls.every(d => downloaded.files.has(d.name))
  }, [downloaded])

  const markDownloaded = useCallback((item) => {
    setDownloaded(prev => {
      const ids = new Set(prev.ids); ids.add(item.id)
      const files = new Set(prev.files); for (const d of item.downloads ?? []) files.add(d.name)
      return { ids, files }
    })
  }, [])

  const load = useCallback(async (force = false) => {
    setLoading(true)
    try {
      const res = await window.api.fetchDiscover({ force })
      if (res?.ok) setData(res)
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshSuggested = useCallback(() => {
    window.api.getSuggestedSources?.().then(s => setSuggested(s ?? []))
  }, [])

  useEffect(() => {
    window.api.getSourceTypes?.().then(t => setTypes(t ?? []))
    refreshSuggested()
    refreshDownloaded()
    load(false)
  }, [load, refreshSuggested, refreshDownloaded])

  const removeSource = async (id) => {
    await window.api.unfollowSource(id)
    refreshSuggested()
    load(false)
  }

  // follow one suggested creator, or all (entries=null) — pre-verified, instant
  const followSuggested = useCallback(async (entries) => {
    setFollowingAll(true)
    try {
      await window.api.followSuggestedSources(entries)
      refreshSuggested()
      await load(false) // pull the newly-followed feeds in
    } finally {
      setFollowingAll(false)
    }
  }, [load, refreshSuggested])

  const visible = useMemo(() => {
    let items = data?.items ?? []
    if (sourceFilter !== 'all') items = items.filter(i => i.sourceId === sourceFilter)
    if (onlyFree) items = items.filter(i => (i.downloads?.length ?? 0) > 0)
    const q = query.trim().toLowerCase()
    if (q) {
      items = items.filter(i =>
        i.title?.toLowerCase().includes(q) ||
        i.author?.toLowerCase().includes(q) ||
        i.summary?.toLowerCase().includes(q)
      )
    }
    return items
  }, [data, query, sourceFilter, onlyFree])

  // Infinite feed. Variant 1: only render `shown` cards, widen the window as the
  // sentinel scrolls in. Variant 2: once every loaded item is on screen, pull the
  // next network page (Patreon cursor) and merge it in.
  const PAGE = 40
  const [shown, setShown] = useState(PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef(null)

  useEffect(() => { setShown(PAGE) }, [query, sourceFilter, onlyFree]) // reset window when the filtered set changes

  const loadMore = useCallback(async () => {
    if (loadingMore) return
    setLoadingMore(true)
    try {
      const res = await window.api.fetchMoreDiscover?.()
      setData(d => {
        if (!d) return d
        if (!res?.items?.length) return { ...d, hasMore: false }
        const seen = new Set(d.items.map(i => i.id))
        const merged = [...d.items, ...res.items.filter(i => !seen.has(i.id))]
        merged.sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
        return { ...d, items: merged, hasMore: res.hasMore }
      })
    } finally {
      setLoadingMore(false)
    }
  }, [loadingMore])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      if (shown < visible.length) setShown(s => s + PAGE)
      else if (data?.hasMore) loadMore()
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [shown, visible.length, data?.hasMore, loadMore])

  const erroredSources = (data?.sources ?? []).filter(s => s.error)
  const freeCount = (data?.items ?? []).filter(i => (i.downloads?.length ?? 0) > 0).length

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-8 pt-6 pb-4 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="page-title">Discover</h2>
            <p className="page-subtitle">
              Follow creators on Patreon, Pinterest boards, Tumblr blogs — plus the latest from ModTheSims
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowManage(s => !s)} className="btn-ghost px-3 py-2 text-sm">
              {showManage ? '✕ Close' : '⚙ Sources'}
            </button>
            <button onClick={() => load(true)} disabled={loading} className="btn-primary px-3 py-2 text-sm">
              {loading ? (
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
              ) : '🔄 Refresh'}
            </button>
          </div>
        </div>

        {showManage && (
          <div className="card p-4 mb-3 flex flex-col gap-4">
            <div>
              <p className="text-gray-400 text-xs mb-2">Add your own source</p>
              <AddSourceForm types={types} onAdded={() => { load(false); refreshSuggested() }} />
            </div>

            <SuggestedCreators
              suggested={suggested}
              onFollow={followSuggested}
              busy={followingAll}
            />

            <div>
              <p className="text-gray-400 text-xs mb-2">Following ({(data?.sources ?? []).length})</p>
              <div className="flex flex-wrap gap-2">
                {(data?.sources ?? []).map(s => (
                  <span key={s.id} className={`chip !cursor-default ${s.error ? '!border-red-700/60' : ''}`}>
                    {TYPE_META[s.type]?.icon} {s.label}
                    <span className="text-gray-600">({s.count})</span>
                    {!s.builtin && (
                      <button
                        onClick={() => removeSource(s.id)}
                        className="text-gray-500 hover:text-red-400 ml-1"
                        title="Unfollow"
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm pointer-events-none">🔍</span>
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter fetched items…"
              className="input w-64 pl-9 pr-3 py-2"
            />
          </div>
          <button
            onClick={() => setOnlyFree(f => !f)}
            className={`chip ${onlyFree ? 'chip-active' : ''}`}
            title="Only posts with free, directly-installable files"
          >
            🆓 Free & installable
            {freeCount > 0 && <span className="badge bg-emerald-600/40 text-emerald-200 ml-1">{freeCount}</span>}
          </button>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setSourceFilter('all')} className={`chip ${sourceFilter === 'all' ? 'chip-active' : ''}`}>
              All
            </button>
            {(() => {
              const opts = (data?.sources ?? []).filter(s => s.count > 0 || s.error)
              if (!opts.length) return null
              return (
                <select
                  value={sourceFilter === 'all' ? '' : sourceFilter}
                  onChange={e => setSourceFilter(e.target.value || 'all')}
                  className="input px-2.5 py-2 text-sm bg-[#12141f] max-w-[14rem]"
                  title="Filter by source"
                >
                  <option value="">▾ By source ({opts.length})</option>
                  {opts.map(s => (
                    <option key={s.id} value={s.id}>
                      {TYPE_META[s.type]?.icon} {s.label}{s.count ? ` (${s.count})` : ''}{s.error ? ' ⚠' : ''}
                    </option>
                  ))}
                </select>
              )
            })()}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-8 py-6">
        {erroredSources.length > 0 && (
          <div className="mb-4 banner-warn">
            {erroredSources.map(s => (
              <p key={s.id}>⚠️ {s.label}: {s.error}</p>
            ))}
          </div>
        )}

        {loading && !data && (
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card">
                <div className="w-full h-36 skeleton" />
                <div className="p-3 flex flex-col gap-2">
                  <div className="h-4 w-3/4 skeleton rounded" />
                  <div className="h-3 w-1/2 skeleton rounded" />
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && visible.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <span className="text-5xl">🌐</span>
            <p className="text-sm">
              {query || sourceFilter !== 'all'
                ? 'Nothing matches your filter.'
                : 'Follow a creator via “⚙ Sources” to fill this feed.'}
            </p>
          </div>
        )}

        {visible.length > 0 && (
          <>
            <p className="text-gray-500 text-xs mb-4">
              Showing {Math.min(shown, visible.length)} of {visible.length}
              {data?.fetchedAt && ` · fetched ${new Date(data.fetchedAt).toLocaleTimeString()}`}
            </p>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
              {visible.slice(0, shown).map(item => (
                <ItemCard key={item.id} item={item} onOpen={setSelected} installed={isInstalled(item)} onDownloaded={markDownloaded} />
              ))}
            </div>
            {/* sentinel: scrolling it into view widens the window / pulls the next page */}
            <div ref={sentinelRef} className="h-10 flex items-center justify-center">
              {loadingMore && <span className="animate-spin inline-block w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full" />}
              {!loadingMore && shown >= visible.length && !data?.hasMore && (
                <span className="text-gray-600 text-xs">— конец ленты —</span>
              )}
            </div>
          </>
        )}
      </div>

      {selected && (
        <DiscoverDetail
          item={selected}
          onClose={() => setSelected(null)}
          renderDownload={(it) => <DiscoverDownloadButton item={it} installed={isInstalled(it)} onDownloaded={markDownloaded} />}
        />
      )}
    </div>
  )
}
