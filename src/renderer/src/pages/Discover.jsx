import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Globe, CircleNotch, Check, Warning, Plus, CaretRight, Sparkle, GearSix, X, MagnifyingGlass, ArrowsClockwise, ArrowUpRight, Clock, LockSimple, Gift, Package, DownloadSimple } from '@phosphor-icons/react'
import { formatRelative } from '../lib/format'
import { markChanged } from '../lib/sessionActivity'
import DiscoverDetail from '../components/DiscoverDetail'
import SourceIcon from '../components/SourceIcon'

// badge tint per source type — the glyph itself comes from SourceIcon (real logos)
const TYPE_META = {
  patreon: { badge: 'bg-orange-600/30 text-orange-200' },
  pinterest: { badge: 'bg-red-600/30 text-red-200' },
  tumblr: { badge: 'bg-sky-600/30 text-sky-200' },
  modthesims: { badge: 'bg-emerald-600/30 text-emerald-200' }
}

/** Inline source-type icon — real brand logo where one exists. */
function TypeIcon({ type, size = 13, className = '' }) {
  return <SourceIcon type={type} size={size} className={className} />
}

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="100%" height="100%" fill="#0c1a12"/><text x="50%" y="50%" font-size="40" text-anchor="middle" dy=".35em" fill="#1f6a4d">&#9670;</text></svg>'
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
            <option key={t.type} value={t.type}>{t.label}</option>
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
          {state === 'adding'
            ? <><CircleNotch size={15} weight="bold" className="animate-spin" /> Checking…</>
            : <><Plus size={15} weight="bold" /> {`Follow${count > 1 ? ` (${count})` : ''}`}</>}
        </button>
      </div>
      {report && (
        <p className="text-xs flex items-center gap-1 flex-wrap">
          <span className="text-emerald-400 inline-flex items-center gap-1"><Check size={12} weight="bold" /> Added {report.added}</span>
          {report.skipped > 0 && <span className="text-gray-400 ml-2">· {report.skipped} already following</span>}
          {failed.length > 0 && (
            <span className="text-red-400 ml-2 inline-flex items-center gap-1">
              <Warning size={12} weight="fill" /> {failed.length} failed: {failed.map(f => `${f.input} (${f.error ?? 'error'})`).join(', ')}
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
        ? <><Package size={14} weight="bold" /> Installing…</>
        : <><CircleNotch size={14} weight="bold" className="animate-spin" /> {`${multi ? `${progress.fileIndex}/${progress.fileCount} · ` : ''}${pct != null ? `${pct}%` : '…'}`}</>
      : state === 'done' ? <><Check size={14} weight="bold" /> Installed</>
        : state === 'error' ? <><Warning size={14} weight="bold" /> Failed — retry</>
          : <><DownloadSimple size={14} weight="bold" /> {`Download${item.downloads.length > 1 ? ` (${item.downloads.length})` : ''}`}</>

  const cls =
    state === 'downloading' ? 'btn-ghost cursor-wait'
      : state === 'done' ? 'btn-success cursor-default'
        : state === 'error' ? 'btn-danger'
          : 'btn-primary'

  return (
    <button onClick={onClick} disabled={state === 'downloading' || state === 'done'} title={state === 'done' ? 'Already downloaded through the app' : undefined} className={`relative overflow-hidden ${cls} mt-2 px-3 py-1.5 text-xs`}>
      {label}
      {state === 'downloading' && pct != null && progress?.phase !== 'installing' && (
        <span className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400 transition-[width] duration-200" style={{ width: `${pct}%` }} />
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
          <CaretRight size={12} weight="bold" className={`transition-transform ${open ? 'rotate-90' : ''}`} />
          <Sparkle size={13} weight="fill" className="text-emerald-400" />
          Suggested creators — popular Sims 4 makers ({suggested.length})
        </button>
        {open && notFollowed.length > 0 && (
          <button onClick={() => onFollow(null)} disabled={busy} className="btn-primary px-3 py-1 text-xs">
            {busy ? 'Adding…' : <><Plus size={14} weight="bold" /> {`Follow all (${notFollowed.length})`}</>}
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
            className={`chip ${s.followed ? 'chip-active !cursor-default' : 'hover:border-emerald-500/60'}`}
            title={s.tag}
          >
            <TypeIcon type={s.type} /> {s.label}
            {s.followed ? <Check size={12} weight="bold" className="text-emerald-400 ml-0.5" /> : <Plus size={12} weight="bold" className="text-emerald-300 ml-0.5" />}
          </button>
        ))}
      </div>
      )}
    </div>
  )
}

function ItemCard({ item, onOpen, installed = false, onDownloaded }) {
  const meta = TYPE_META[item.sourceType] ?? { badge: 'bg-gray-700 text-gray-300' }
  const canDownload = (item.downloads?.length ?? 0) > 0
  return (
    <div
      onClick={() => onOpen(item)}
      className="card card-hover flex flex-col cursor-pointer"
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
          <TypeIcon type={item.sourceType} /> {item.sourceType}
        </span>
        {item.locked ? (
          <span className="absolute top-2 right-2 badge bg-black/70 text-amber-300 backdrop-blur-sm" title="Patron-only post — opens on Patreon">
            <LockSimple size={11} weight="fill" /> patrons
          </span>
        ) : installed ? (
          <span className="absolute top-2 right-2 badge bg-emerald-500 text-white backdrop-blur-sm" title="Already downloaded through the app">
            <Check size={11} weight="bold" /> installed
          </span>
        ) : canDownload && (
          <span className="absolute top-2 right-2 badge bg-emerald-600/80 text-white backdrop-blur-sm" title="Free files attached — installs directly">
            <Gift size={11} weight="fill" /> free
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-white font-semibold text-sm leading-tight line-clamp-2" title={item.title}>
          {item.title}
        </p>
        {item.author && <p className="text-emerald-400 text-xs truncate">{item.author}</p>}
        {item.summary && (
          <p className="text-gray-500 text-xs leading-snug line-clamp-2">{item.summary}</p>
        )}
        <div className="flex items-center gap-2 mt-auto pt-1.5 text-gray-600 text-[11px]">
          {item.date && <span className="inline-flex items-center gap-1"><Clock size={12} weight="regular" /> {formatRelative(item.date)}</span>}
          <span className="ml-auto text-gray-500 inline-flex items-center gap-1"><ArrowUpRight size={12} weight="bold" /> open</span>
        </div>
        {canDownload && <DiscoverDownloadButton item={item} installed={installed} onDownloaded={onDownloaded} />}
      </div>
    </div>
  )
}

export default function Discover({ source = 'patreon' }) {
  const [types, setTypes] = useState([])
  const [data, setData] = useState(null) // { items, sources, fetchedAt }
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [postFilter, setPostFilter] = useState('all') // all | free | paid — source picked in the sidebar
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
    // paint the last feed from disk instantly, then revalidate in the background
    ;(window.api.getCachedDiscover?.() ?? Promise.resolve(null)).then(cached => {
      if (cached?.items?.length) { setData(cached); setLoading(false) }
      load(false)
    })
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

  // items narrowed to the sidebar-selected source type (before the All/Free/Paid split)
  const sourceItems = useMemo(() => {
    const items = data?.items ?? []
    return source === 'all' ? items : items.filter(i => i.sourceType === source)
  }, [data, source])

  const freeCount = useMemo(() => sourceItems.filter(i => (i.downloads?.length ?? 0) > 0).length, [sourceItems])
  const paidCount = useMemo(() => sourceItems.filter(i => i.locked).length, [sourceItems])

  const visible = useMemo(() => {
    let items = sourceItems
    // free = installable files attached; paid = patron-locked; all = either (drops empty news posts)
    if (postFilter === 'free') items = items.filter(i => (i.downloads?.length ?? 0) > 0)
    else if (postFilter === 'paid') items = items.filter(i => i.locked)
    else items = items.filter(i => i.locked || (i.downloads?.length ?? 0) > 0)
    const q = query.trim().toLowerCase()
    if (q) {
      items = items.filter(i =>
        i.title?.toLowerCase().includes(q) ||
        i.author?.toLowerCase().includes(q) ||
        i.summary?.toLowerCase().includes(q)
      )
    }
    return items
  }, [sourceItems, query, postFilter])

  // Infinite feed. Variant 1: only render `shown` cards, widen the window as the
  // sentinel scrolls in. Variant 2: once every loaded item is on screen, pull the
  // next network page (Patreon cursor) and merge it in.
  const PAGE = 40
  const [shown, setShown] = useState(PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef(null)

  useEffect(() => { setShown(PAGE) }, [query, source, postFilter]) // reset window when the filtered set changes

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

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="page-title">Discover</h2>
            <p className="page-subtitle">
              Follow creators on Patreon, Pinterest boards, Tumblr blogs — plus the latest from ModTheSims
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowManage(s => !s)} className="btn-ghost px-3 py-2 text-sm">
              {showManage ? <><X size={15} weight="bold" /> Close</> : <><GearSix size={15} weight="fill" /> Sources</>}
            </button>
            <button onClick={() => load(true)} disabled={loading} className="btn-primary px-3 py-2 text-sm">
              {loading ? (
                <CircleNotch size={16} weight="bold" className="animate-spin" />
              ) : <><ArrowsClockwise size={15} weight="bold" /> Refresh</>}
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
                    <TypeIcon type={s.type} /> {s.label}
                    <span className="text-gray-600">({s.count})</span>
                    {!s.builtin && (
                      <button
                        onClick={() => removeSource(s.id)}
                        className="text-gray-500 hover:text-red-400 ml-1"
                        title="Unfollow"
                      >
                        <X size={12} weight="bold" />
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
            <MagnifyingGlass size={16} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Filter fetched items…"
              className="input w-64 pl-9 pr-3 py-2"
            />
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button onClick={() => setPostFilter('all')} className={`chip ${postFilter === 'all' ? 'chip-active' : ''}`} title="Free + patron-only posts (hides news posts with nothing attached)">
              All
            </button>
            <button onClick={() => setPostFilter('free')} className={`chip ${postFilter === 'free' ? 'chip-active' : ''}`} title="Posts with free, directly-installable files">
              <Gift size={13} weight="fill" /> Free
              {freeCount > 0 && <span className="badge bg-emerald-600/40 text-emerald-200 ml-1">{freeCount}</span>}
            </button>
            <button onClick={() => setPostFilter('paid')} className={`chip ${postFilter === 'paid' ? 'chip-active' : ''}`} title="Patron-only posts — open on Patreon">
              <LockSimple size={13} weight="fill" /> Paid
              {paidCount > 0 && <span className="badge bg-amber-600/40 text-amber-200 ml-1">{paidCount}</span>}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {erroredSources.length > 0 && (
          <div className="mb-4 banner-warn">
            {erroredSources.map(s => (
              <p key={s.id} className="flex items-center gap-1.5"><Warning size={13} weight="fill" className="shrink-0" /> {s.label}: {s.error}</p>
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
            <Globe size={52} weight="thin" className="text-emerald-500/30" />
            <p className="text-sm flex items-center gap-1 flex-wrap justify-center">
              {query || postFilter !== 'all' || source !== 'all'
                ? 'Nothing matches this source or filter.'
                : <>Follow a creator via <GearSix size={13} weight="fill" className="inline" /> Sources to fill this feed.</>}
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
              {loadingMore && <CircleNotch size={20} weight="bold" className="animate-spin text-emerald-400" />}
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
