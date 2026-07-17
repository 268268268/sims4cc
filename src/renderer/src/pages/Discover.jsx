import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { Globe, CircleNotch, Check, Warning, Plus, CaretRight, CaretLeft, Sparkle, GearSix, X, MagnifyingGlass, ArrowsClockwise, ArrowUpRight, Clock, LockSimple, Gift, Package, DownloadSimple } from '@phosphor-icons/react'
import { formatRelative } from '../lib/format'
import { markChanged } from '../lib/sessionActivity'
import DiscoverDetail from '../components/DiscoverDetail'
import CategoryFilter from '../components/CategoryFilter'
import SourceIcon from '../components/SourceIcon'
import RecentAuthors from '../components/RecentAuthors'
import { pushAuthor } from '../lib/authorHistory'
import { isDownloadable } from '../lib/downloadable'
import { useT } from '../lib/i18n'

// badge tint per source type — the glyph itself comes from SourceIcon (real logos)
const TYPE_META = {
  patreon: { badge: 'bg-orange-600/30 text-orange-200', label: 'Patreon' },
  pinterest: { badge: 'bg-red-600/30 text-red-200', label: 'Pinterest' },
  tumblr: { badge: 'bg-sky-600/30 text-sky-200', label: 'Tumblr' },
  modthesims: { badge: 'bg-emerald-600/30 text-emerald-200', label: 'ModTheSims' }
}

/** Inline source-type icon — real brand logo where one exists. */
function TypeIcon({ type, size = 13, className = '' }) {
  return <SourceIcon type={type} size={size} className={className} />
}

// mirrors MTS_SORTS / MTS_CATEGORIES in main/services/sources/modthesims.js —
// can't import across the process boundary without dragging node deps into vite
const MTS_SORTS = ['new', 'featured', 'picked', 'popular']
const MTS_CATEGORIES = [
  { id: 145, label: 'Sims' },
  { id: 485, label: 'Pets' },
  { id: 143, label: 'Lots & Housing' },
  { id: 342, label: 'Body Shop' },
  { id: 385, label: 'Buy Mode' },
  { id: 380, label: 'Build Mode' },
  { id: 414, label: 'Game Mods' },
  { id: 229, label: 'Careers' },
  { id: 747, label: 'Traits' },
  { id: 519, label: 'Miscellaneous' }
]

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="100%" height="100%" fill="#0c1a12"/><text x="50%" y="50%" font-size="40" text-anchor="middle" dy=".35em" fill="#1f6a4d">&#9670;</text></svg>'
  )

function AddSourceForm({ types, onAdded }) {
  const { t } = useT()
  const [type, setType] = useState('patreon')
  const [input, setInput] = useState('')
  const [state, setState] = useState('idle') // idle | adding
  const [error, setError] = useState(null)
  const [report, setReport] = useState(null) // { added, results:[{input,ok,error}] } from a batch

  const hint = types.find(t => t.type === type)?.hint ?? ''
  // short "how do I add one" line, tailored to the selected source type
  const help = { patreon: t('discover.addHelpPatreon'), pinterest: t('discover.addHelpPinterest'), tumblr: t('discover.addHelpTumblr') }[type]
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
            placeholder={`${hint} — ${t('discover.addMultiHint')}`}
            rows={2}
            className="input w-full px-3 py-2 text-sm resize-y"
          />
          {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
        </div>
        <button onClick={onAdd} disabled={state === 'adding'} className="btn-primary px-4 py-2 text-sm whitespace-nowrap">
          {state === 'adding'
            ? <><CircleNotch size={15} weight="bold" className="animate-spin" /> {t('discover.addChecking')}</>
            : <><Plus size={15} weight="bold" /> {count > 1 ? t('discover.addFollowN', { count }) : t('discover.addFollow')}</>}
        </button>
      </div>
      {help && (
        <p className="text-gray-500 text-[11px] flex items-start gap-1">
          <Sparkle size={12} weight="fill" className="text-emerald-500/60 shrink-0 mt-px" /> {help}
        </p>
      )}
      {report && (
        <p className="text-xs flex items-center gap-1 flex-wrap">
          <span className="text-emerald-400 inline-flex items-center gap-1"><Check size={12} weight="bold" /> {t('discover.addReportAdded', { count: report.added })}</span>
          {report.skipped > 0 && <span className="text-gray-400 ml-2">· {t('discover.addReportSkipped', { count: report.skipped })}</span>}
          {failed.length > 0 && (
            <span className="text-red-400 ml-2 inline-flex items-center gap-1">
              <Warning size={12} weight="fill" /> {t('discover.addReportFailed', { count: failed.length })}
            </span>
          )}
        </p>
      )}
      {failed.map(f => (
        <p key={f.input} className="text-red-400/80 text-[11px] font-mono break-all">{f.input} — {f.error}</p>
      ))}
    </div>
  )
}

function LinkDownloadBox({ onResolved }) {
  const { t } = useT()
  const [url, setUrl] = useState('')
  const [state, setState] = useState('idle') // idle | resolving | error
  const [result, setResult] = useState(null) // { ok:false, openUrl, reason }

  const onFetch = async () => {
    const link = url.trim()
    if (!link || state === 'resolving') return
    setState('resolving')
    setResult(null)
    try {
      const r = await window.api.resolveDiscoverLink(link)
      if (r?.ok) {
        setUrl('')
        setState('idle')
        onResolved(r) // opens the preview modal with a Download button
      } else {
        setResult(r ?? { reason: 'Could not resolve this link.' })
        setState('error')
      }
    } catch (err) {
      setResult({ reason: err.message })
      setState('error')
    }
  }

  return (
    <div>
      <p className="text-gray-400 text-xs mb-2">{t('discover.linkTitle')}</p>
      <div className="flex items-center gap-2">
        <input
          value={url}
          onChange={e => setUrl(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') onFetch() }}
          placeholder={t('discover.linkPlaceholder')}
          className="input flex-1 px-3 py-2 text-sm"
        />
        <button onClick={onFetch} disabled={state === 'resolving'} className="btn-primary px-4 py-2 text-sm">
          {state === 'resolving'
            ? <><CircleNotch size={15} weight="bold" className="animate-spin" /> {t('discover.linkResolving')}</>
            : <><DownloadSimple size={15} weight="bold" /> {t('discover.linkFetch')}</>}
        </button>
      </div>
      <p className="text-gray-600 text-[11px] mt-1">{t('discover.linkHint')}</p>
      {state === 'error' && result && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-300">
          <Warning size={13} weight="fill" className="shrink-0" />
          <span className="flex-1">{result.reason}</span>
          {result.openUrl && (
            <button onClick={() => window.api.openExternal(result.openUrl)} className="btn-ghost px-2.5 py-1 text-xs shrink-0">
              <ArrowUpRight size={13} weight="bold" /> {t('discover.linkOpenInstead')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function DiscoverDownloadButton({ item, installed = false, onDownloaded }) {
  const { t } = useT()
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
        ? <><Package size={14} weight="bold" /> {t('curseforge.installing')}</>
        : <><CircleNotch size={14} weight="bold" className="animate-spin" /> {`${multi ? `${progress.fileIndex}/${progress.fileCount} · ` : ''}${pct != null ? `${pct}%` : '…'}`}</>
      : state === 'done' ? <><Check size={14} weight="bold" /> {t('curseforge.installedBadge')}</>
        : state === 'error' ? <><Warning size={14} weight="bold" /> {t('curseforge.failedRetry')}</>
          : <><DownloadSimple size={14} weight="bold" /> {`${t('discover.download')}${(item.downloads?.length ?? 0) > 1 ? ` (${item.downloads.length})` : ''}`}</>

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

function ItemCard({ item, onOpen, installed = false, onDownloaded, onOpenAuthor }) {
  const { t } = useT()
  const meta = TYPE_META[item.sourceType] ?? { badge: 'bg-gray-700 text-gray-300' }
  const canDownload = isDownloadable(item)
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
          <span className="absolute top-2 right-2 badge bg-black/70 text-amber-300 backdrop-blur-sm" title={t('discover.filterPaidTip')}>
            <LockSimple size={11} weight="fill" /> {t('discover.patronsOnly')}
          </span>
        ) : installed ? (
          <span className="absolute top-2 right-2 badge bg-emerald-500 text-white backdrop-blur-sm" title={t('discover.installedBadge')}>
            <Check size={11} weight="bold" /> {t('discover.installedBadge')}
          </span>
        ) : canDownload && (
          <span className="absolute top-2 right-2 badge bg-emerald-600/80 text-white backdrop-blur-sm" title={t('discover.filterFreeTip')}>
            <Gift size={11} weight="fill" /> {t('discover.freeBadge')}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-white font-semibold text-sm leading-tight line-clamp-2" title={item.title}>
          {item.title}
        </p>
        {item.author && (
          item.sourceId && onOpenAuthor ? (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenAuthor(item) }}
              className="text-emerald-400 hover:text-emerald-300 hover:underline text-xs truncate text-left"
              title={`See all from ${item.author}`}
            >
              {item.author}
            </button>
          ) : <p className="text-emerald-400 text-xs truncate">{item.author}</p>
        )}
        {item.summary && (
          <p className="text-gray-500 text-xs leading-snug line-clamp-2">{item.summary}</p>
        )}
        <div className="flex items-center gap-2 mt-auto pt-1.5 text-gray-600 text-[11px]">
          {item.date && <span className="inline-flex items-center gap-1"><Clock size={12} weight="regular" /> {formatRelative(item.date)}</span>}
          <span
            className="ml-auto text-gray-400 inline-flex items-center gap-1"
            title={t('discover.openOn', { source: meta.label ?? item.sourceType })}
          >
            <ArrowUpRight size={12} weight="bold" /> {item.locked ? t('discover.openOn', { source: meta.label ?? item.sourceType }) : t('discover.open')}
          </span>
        </div>
        {/* locked posts can't install in-app — send the user to the source to view/back it */}
        {canDownload ? (
          <DiscoverDownloadButton item={item} installed={installed} onDownloaded={onDownloaded} />
        ) : item.locked ? (
          <button
            onClick={(e) => { e.stopPropagation(); window.api.openExternal(item.url) }}
            className="btn-ghost mt-3 px-3 py-1.5 text-xs w-full"
          >
            <ArrowUpRight size={13} weight="bold" /> {t('discover.openOn', { source: meta.label ?? item.sourceType })}
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default function Discover({ source = 'patreon', pendingAuthor, onNavigateAuthor, onPendingAuthorConsumed }) {
  const { t } = useT()
  const [types, setTypes] = useState([])
  const [data, setData] = useState(null) // { items, sources, fetchedAt }
  const [sourceList, setSourceList] = useState(null) // followed sources — read cheaply (no network) so empty tabs answer instantly
  const [savedLinks, setSavedLinks] = useState([]) // links pasted into "Download from a link", persisted + shown on their tab
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [postFilter, setPostFilter] = useState('all') // all | free | paid — source picked in the sidebar
  const [showManage, setShowManage] = useState(false)
  const [selected, setSelected] = useState(null) // detail modal target
  const [suggested, setSuggested] = useState([])
  const [followingAll, setFollowingAll] = useState(false)
  const [downloaded, setDownloaded] = useState(() => ({ ids: new Set(), files: new Set() }))
  // author view: one creator's full feed, paged independently of the aggregate.
  // The MTS tab reuses it as a site browser ({ mts: true }) with sort/category filters.
  const [authorView, setAuthorView] = useState(null) // { sourceId, name, mts? } | null
  const [mtsSort, setMtsSort] = useState('new')
  const [mtsCat, setMtsCat] = useState(null)
  const [authorItems, setAuthorItems] = useState([])
  const [authorCursor, setAuthorCursor] = useState(null)
  const [authorHasMore, setAuthorHasMore] = useState(false)
  const [authorLoading, setAuthorLoading] = useState(false)
  const scrollRootRef = useRef(null)
  const preAuthorScrollRef = useRef(null)  // scrollTop before entering author view
  const restoreAuthorScrollRef = useRef(null)

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

  // quiet = revalidate in the background without spinning the header/skeletons.
  // The in-memory source cache is empty on every launch, so a non-quiet revalidate
  // would spin the Refresh button for the whole (multi-source) re-scrape even
  // though the disk snapshot already painted the feed — that read as "stuck".
  const load = useCallback(async (force = false, quiet = false) => {
    if (!quiet) setLoading(true)
    try {
      const res = await window.api.fetchDiscover({ force })
      if (res?.ok) setData(res)
    } finally {
      if (!quiet) setLoading(false)
    }
  }, [])

  const refreshSuggested = useCallback(() => {
    window.api.getSuggestedSources?.().then(s => setSuggested(s ?? []))
  }, [])

  // The followed-source list is a cheap local read (no network), unlike the full
  // aggregate feed which can take a while when many creators are followed. Load it
  // up front so a tab with no sources of its type (e.g. Pinterest) can show its
  // "add one" hint immediately instead of spinning until the whole feed arrives.
  const refreshSourceList = useCallback(() => {
    window.api.getSources?.().then(s => setSourceList(s ?? []))
  }, [])

  const refreshSavedLinks = useCallback(() => {
    window.api.getSavedLinks?.().then(s => setSavedLinks(s ?? []))
  }, [])

  useEffect(() => {
    window.api.getSourceTypes?.().then(t => setTypes(t ?? []))
    refreshSuggested()
    refreshSourceList()
    refreshSavedLinks()
    refreshDownloaded()
    // paint the last feed from disk instantly, then revalidate. If we have a
    // cached feed to show, revalidate QUIETLY (no spinner) — otherwise show the
    // loading state until the first real fetch lands.
    ;(window.api.getCachedDiscover?.() ?? Promise.resolve(null)).then(cached => {
      if (cached?.items?.length) { setData(cached); setLoading(false); load(false, true) }
      else load(false)
    })
  }, [load, refreshSuggested, refreshSourceList, refreshSavedLinks, refreshDownloaded])

  const removeSavedLink = useCallback(async (id) => {
    await window.api.removeSavedLink?.(id)
    refreshSavedLinks()
  }, [refreshSavedLinks])

  const removeSource = async (id) => {
    await window.api.unfollowSource(id)
    refreshSuggested()
    refreshSourceList()
    load(false)
  }

  // follow one suggested creator, or all (entries=null) — pre-verified, instant
  const followSuggested = useCallback(async (entries) => {
    setFollowingAll(true)
    try {
      await window.api.followSuggestedSources(entries)
      refreshSuggested()
      refreshSourceList()
      await load(false) // pull the newly-followed feeds in
    } finally {
      setFollowingAll(false)
    }
  }, [load, refreshSuggested, refreshSourceList])

  // items narrowed to the sidebar-selected source type (before the All/Free/Paid split).
  // Saved links (pasted into "Download from a link") are pinned in front on the tab
  // they were pasted from, and survive restarts — deduped against the fetched feed.
  const sourceItems = useMemo(() => {
    const items = data?.items ?? []
    const saved = (savedLinks ?? []).map(s => ({ ...s, date: s.savedAt ?? s.date }))
    // dedupe across id namespaces: a resolved id is `resolved:patreon:123` while
    // the same post in the fetched feed is `patreon:123` — strip the prefix so a
    // followed creator's post pasted as a link doesn't render twice.
    const savedKeys = new Set(saved.flatMap(s => [s.id, String(s.id).replace(/^resolved:/, '')]))
    const merged = [...saved, ...items.filter(i => !savedKeys.has(i.id))]
    return source === 'all' ? merged : merged.filter(i => i.sourceType === source)
  }, [data, source, savedLinks])

  const freeCount = useMemo(() => sourceItems.filter(i => isDownloadable(i)).length, [sourceItems])
  const paidCount = useMemo(() => sourceItems.filter(i => i.locked).length, [sourceItems])

  const visible = useMemo(() => {
    let items = sourceItems
    // free = installable files attached; paid = patron-locked. "All" drops empty
    // Patreon news posts, but keeps every post from link-showcase sources like
    // Tumblr/ModTheSims (those never attach files — each post links out to the CC).
    if (postFilter === 'free') items = items.filter(i => isDownloadable(i))
    else if (postFilter === 'paid') items = items.filter(i => i.locked)
    else items = items.filter(i => i.sourceType !== 'patreon' || i.locked || (i.downloads?.length ?? 0) > 0)
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
  const [authorShown, setAuthorShown] = useState(PAGE)
  const [loadingMore, setLoadingMore] = useState(false)
  const sentinelRef = useRef(null)

  useEffect(() => { setShown(PAGE) }, [query, source, postFilter]) // reset window when the filtered set changes
  useEffect(() => { setAuthorShown(PAGE) }, [query, authorView]) // reset author window on search / new author
  useEffect(() => { setPostFilter('all') }, [source]) // Free/Paid don't apply to every source — reset on switch
  // leave author view when the sidebar source changes — but NOT on first mount,
  // or a cross-tab jump that opens an author on mount would be wiped immediately
  const sourceInitRef = useRef(true)
  useEffect(() => {
    if (sourceInitRef.current) { sourceInitRef.current = false; return }
    setAuthorView(null)
  }, [source])

  // author feed, narrowed by the same search box for consistency
  const authorVisible = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? authorItems.filter(i => i.title?.toLowerCase().includes(q) || i.summary?.toLowerCase().includes(q)) : authorItems
  }, [authorItems, query])

  const loadAuthor = useCallback(async (sourceId, opts = {}) => {
    setAuthorLoading(true)
    try {
      const res = await window.api.fetchSourceDiscover?.({ sourceId, cursor: null, ...opts })
      if (res?.ok) { setAuthorItems(res.items ?? []); setAuthorCursor(res.nextCursor ?? null); setAuthorHasMore(!!res.nextCursor) }
      else { setAuthorItems([]); setAuthorCursor(null); setAuthorHasMore(false) }
    } finally { setAuthorLoading(false) }
  }, [])

  // The MTS tab is a dedicated site browser: its own per-source feed (paging it
  // never re-fetches every followed Patreon/Tumblr source like the aggregate's
  // "load more" does) plus the site's own sort tabs and category forums.
  // NB: must stay below the loadAuthor declaration (const — TDZ).
  useEffect(() => {
    if (source !== 'modthesims') return
    setAuthorView({ sourceId: 'builtin-mts', name: 'ModTheSims', mts: true })
    setAuthorItems([]); setAuthorCursor(null); setAuthorHasMore(false); setAuthorShown(PAGE)
    if (scrollRootRef.current) scrollRootRef.current.scrollTop = 0
    loadAuthor('builtin-mts', { sort: mtsSort, cat: mtsCat })
  }, [source, mtsSort, mtsCat, loadAuthor])

  const openAuthor = useCallback((item) => {
    const sourceId = item?.sourceId
    if (!sourceId) return
    preAuthorScrollRef.current = scrollRootRef.current?.scrollTop ?? 0
    setSelected(null)
    const meta = (data?.sources ?? []).find(s => s.id === sourceId)
    const name = item.author || meta?.label || 'Creator'
    const sourceType = item.sourceType || meta?.type || null
    setAuthorView({ sourceId, name })
    pushAuthor({ type: 'discover', sourceId, sourceType, name })
    setAuthorItems([]); setAuthorCursor(null); setAuthorHasMore(false); setAuthorShown(PAGE)
    if (scrollRootRef.current) scrollRootRef.current.scrollTop = 0
    loadAuthor(sourceId)
  }, [data, loadAuthor])

  // Open a creator handed over from the shared history (possibly from another tab)
  useEffect(() => {
    if (pendingAuthor?.type === 'discover') {
      openAuthor({ sourceId: pendingAuthor.sourceId, sourceType: pendingAuthor.sourceType, author: pendingAuthor.name })
      onPendingAuthorConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuthor])

  const exitAuthor = useCallback(() => {
    restoreAuthorScrollRef.current = preAuthorScrollRef.current
    preAuthorScrollRef.current = null
    setAuthorView(null)
  }, [])

  // restore the aggregate feed's scroll once we're back (its `shown` window is intact)
  useEffect(() => {
    if (!authorView && restoreAuthorScrollRef.current != null && scrollRootRef.current) {
      scrollRootRef.current.scrollTop = restoreAuthorScrollRef.current
      restoreAuthorScrollRef.current = null
    }
  }, [authorView])

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

  const loadAuthorMore = useCallback(async () => {
    if (loadingMore || !authorCursor || !authorView) return
    setLoadingMore(true)
    try {
      const res = await window.api.fetchSourceDiscover?.({
        sourceId: authorView.sourceId,
        cursor: authorCursor,
        ...(authorView.mts ? { sort: mtsSort, cat: mtsCat } : {})
      })
      if (res?.ok) {
        setAuthorItems(prev => {
          const seen = new Set(prev.map(i => i.id))
          return [...prev, ...(res.items ?? []).filter(i => !seen.has(i.id))]
        })
        setAuthorCursor(res.nextCursor ?? null)
        setAuthorHasMore(!!res.nextCursor)
      } else setAuthorHasMore(false)
    } finally { setLoadingMore(false) }
  }, [loadingMore, authorCursor, authorView, mtsSort, mtsCat])

  // the feed currently on screen — author view or the aggregate — with its own window + paging
  const feed = authorView ? authorVisible : visible
  const feedShown = authorView ? authorShown : shown
  const feedHasMore = authorView ? authorHasMore : (data?.hasMore ?? false)
  const activeLoading = authorView ? authorLoading : loading

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return
      if (feedShown < feed.length) (authorView ? setAuthorShown : setShown)(s => s + PAGE)
      else if (feedHasMore) (authorView ? loadAuthorMore : loadMore)()
    }, { rootMargin: '600px' })
    io.observe(el)
    return () => io.disconnect()
  }, [feedShown, feed.length, feedHasMore, authorView, loadMore, loadAuthorMore])

  const erroredSources = (data?.sources ?? []).filter(s => s.error)

  // Followed sources of the currently-selected type. Prefer the cheap up-front
  // list (sourceList) so this is known within milliseconds of mount; the fetched
  // aggregate (data.sources) supersedes it once available. A tab with none of its
  // type shows an "add one" hint immediately instead of spinning skeletons forever
  // — this is what made the Pinterest tab look like it loaded infinitely.
  const knownSources = data?.sources ?? sourceList
  const tabSourceCount = source === 'all'
    ? (knownSources ?? []).length
    : (knownSources ?? []).filter(s => s.type === source).length
  const noSourcesForTab = knownSources != null && !authorView && tabSourceCount === 0

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="page-title">{t('discover.title')}</h2>
            <p className="page-subtitle">
              {t('discover.subtitle')}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RecentAuthors onPick={onNavigateAuthor} />
            <button onClick={() => setShowManage(s => !s)} className="btn-ghost px-3 py-2 text-sm">
              {showManage ? <><X size={15} weight="bold" /> {t('discover.close')}</> : <><GearSix size={15} weight="fill" /> {t('discover.sources')}</>}
            </button>
            <button onClick={() => load(true)} disabled={loading} className="btn-primary px-3 py-2 text-sm">
              {loading ? (
                <CircleNotch size={16} weight="bold" className="animate-spin" />
              ) : <><ArrowsClockwise size={15} weight="bold" /> {t('discover.refresh')}</>}
            </button>
          </div>
        </div>

        {showManage && (
          <div className="card p-4 mb-3 flex flex-col gap-4">
            <LinkDownloadBox onResolved={(r) => { setSelected(r); refreshSavedLinks() }} />

            {savedLinks.length > 0 && (
              <div>
                <p className="text-gray-400 text-xs mb-2">{t('discover.savedLinks', { count: savedLinks.length })}</p>
                <div className="flex flex-wrap gap-2">
                  {savedLinks.map(s => (
                    <span key={s.id} className="chip !cursor-default" title={s.pinUrl || s.url}>
                      <TypeIcon type={s.sourceType} /> <span className="truncate max-w-[12rem]">{s.title}</span>
                      <button
                        onClick={() => removeSavedLink(s.id)}
                        className="text-gray-500 hover:text-red-400 ml-1"
                        title={t('discover.unfollow')}
                      >
                        <X size={12} weight="bold" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="text-gray-400 text-xs mb-2">{t('discover.addSource')}</p>
              <AddSourceForm types={types} onAdded={() => { load(false); refreshSuggested(); refreshSourceList() }} />
            </div>

            <SuggestedCreators
              suggested={suggested}
              onFollow={followSuggested}
              busy={followingAll}
            />

            <div>
              <p className="text-gray-400 text-xs mb-2 flex items-center gap-2">
                {t('discover.following', { count: (data?.sources ?? []).length })}
                {erroredSources.length > 0 && (
                  <span className="text-gray-600 inline-flex items-center gap-1" title={erroredSources.map(s => s.label).join(', ')}>
                    · {t('discover.someUnreachable', { count: erroredSources.length })}
                  </span>
                )}
              </p>
              <div className="flex flex-wrap gap-2">
                {(data?.sources ?? []).map(s => (
                  <span key={s.id} className={`chip !cursor-default ${s.error ? '!border-red-700/60' : ''}`} title={s.error || undefined}>
                    <TypeIcon type={s.type} /> {s.label}
                    <span className="text-gray-600">({s.count})</span>
                    {!s.builtin && (
                      <button
                        onClick={() => removeSource(s.id)}
                        className="text-gray-500 hover:text-red-400 ml-1"
                        title={t('discover.unfollow')}
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
              placeholder={t('discover.filterPlaceholder')}
              className="input w-64 pl-9 pr-3 py-2"
            />
          </div>
          {authorView?.mts ? (
            <div className="flex items-center gap-1.5 flex-wrap min-w-0">
              {MTS_SORTS.map(s => (
                <button key={s} onClick={() => setMtsSort(s)} className={`chip ${mtsSort === s ? 'chip-active' : ''}`}>
                  {t(`discover.mts${s[0].toUpperCase()}${s.slice(1)}`)}
                </button>
              ))}
              {/* ponytail: CF's multi-select dropdown reused in single-select mode */}
              <CategoryFilter
                categories={MTS_CATEGORIES.map(c => ({ id: c.id, name: c.label }))}
                selectedIds={mtsCat != null ? [mtsCat] : []}
                onToggle={(id) => setMtsCat(id === mtsCat ? null : id)}
                onClear={() => setMtsCat(null)}
              />
            </div>
          ) : authorView ? (
            <div className="flex items-center gap-2 min-w-0">
              <button onClick={exitAuthor} className="btn-ghost px-3 py-2 text-sm"><CaretLeft size={15} weight="bold" /> {t('discover.back')}</button>
              <span className="text-white font-semibold truncate">{authorView.name}</span>
              <span className="text-gray-500 text-xs shrink-0">· {authorItems.length}{authorHasMore ? '+' : ''} {t('discover.posts')}</span>
              {(knownSources ?? []).some(s => s.id === authorView.sourceId && !s.builtin) && (
                <button
                  onClick={() => { removeSource(authorView.sourceId); exitAuthor() }}
                  className="btn-ghost px-2.5 py-1.5 text-xs text-gray-400 hover:!text-red-400 shrink-0"
                >
                  <X size={13} weight="bold" /> {t('discover.unfollow')}
                </button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-gray-500 text-xs mr-0.5">{t('discover.filterLabel')}:</span>
              <button onClick={() => setPostFilter('all')} className={`chip ${postFilter === 'all' ? 'chip-active' : ''}`} title={t('discover.filterAllTip')}>
                {t('discover.all')}
              </button>
              {freeCount > 0 && (
                <button onClick={() => setPostFilter('free')} className={`chip ${postFilter === 'free' ? 'chip-active' : ''}`} title={t('discover.filterFreeTip')}>
                  <Gift size={13} weight="fill" /> {t('discover.free')}
                  <span className="badge bg-emerald-600/40 text-emerald-200 ml-1">{freeCount}</span>
                </button>
              )}
              {paidCount > 0 && (
                <button onClick={() => setPostFilter('paid')} className={`chip ${postFilter === 'paid' ? 'chip-active' : ''}`} title={t('discover.filterPaidTip')}>
                  <LockSimple size={13} weight="fill" /> {t('discover.paid')}
                  <span className="badge bg-amber-600/40 text-amber-200 ml-1">{paidCount}</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRootRef} className="flex-1 overflow-y-auto px-6 py-5">
        {/* Failed sources are intentionally NOT shown as a page banner — a source
            that 404s is just skipped; the feed shows whatever loaded. The only
            hint is a subtle red border + count in the Sources panel. */}

        {activeLoading && feed.length === 0 && !noSourcesForTab && (
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

        {(noSourcesForTab || !activeLoading) && feed.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <Globe size={52} weight="thin" className="text-emerald-500/30" />
            {authorView ? (
              <p className="text-sm text-center">{t('discover.emptyNoAuthor', { name: authorView.name })}</p>
            ) : noSourcesForTab ? (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm">{t('discover.emptyNoTypeSources', { type: TYPE_META[source]?.label ?? source })}</p>
                <p className="text-xs text-gray-600">{t('discover.emptyNoTypeSourcesHint')}</p>
                <button onClick={() => setShowManage(true)} className="btn-ghost px-3 py-1.5 text-xs mt-1">
                  <Plus size={13} weight="bold" /> {t('discover.addSourceCta')}
                </button>
              </div>
            ) : query || postFilter !== 'all' ? (
              <p className="text-sm text-center">{t('discover.emptyNoMatch')}</p>
            ) : (
              <div className="flex flex-col items-center gap-2 text-center">
                <p className="text-sm">{t('discover.emptyFollow')}</p>
                <button onClick={() => setShowManage(true)} className="btn-ghost px-3 py-1.5 text-xs mt-1">
                  <Plus size={13} weight="bold" /> {t('discover.addSourceCta')}
                </button>
              </div>
            )}
          </div>
        )}

        {feed.length > 0 && (
          <>
            <p className="text-gray-500 text-xs mb-4">
              {t('discover.showingOf', {
                shown: `${Math.min(feedShown, feed.length)}`,
                total: `${feed.length}${authorView && feedHasMore ? '+' : ''}`
              })}
              {!authorView && data?.fetchedAt && ` · ${t('discover.fetchedAt', { time: new Date(data.fetchedAt).toLocaleTimeString() })}`}
            </p>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))' }}>
              {feed.slice(0, feedShown).map(item => (
                <ItemCard key={item.id} item={item} onOpen={setSelected} installed={isInstalled(item)} onDownloaded={markDownloaded} onOpenAuthor={authorView?.mts ? undefined : openAuthor} />
              ))}
            </div>
            {/* sentinel: scrolling it into view widens the window / pulls the next page */}
            <div ref={sentinelRef} className="h-10 flex items-center justify-center">
              {loadingMore && <CircleNotch size={20} weight="bold" className="animate-spin text-emerald-400" />}
              {!loadingMore && feedShown >= feed.length && !feedHasMore && (
                <span className="text-gray-600 text-xs">{t('discover.endOfFeed')}</span>
              )}
            </div>
          </>
        )}
      </div>

      {selected && (
        <DiscoverDetail
          item={selected}
          onClose={() => setSelected(null)}
          onOpenAuthor={openAuthor}
          renderDownload={(it) => <DiscoverDownloadButton item={it} installed={isInstalled(it)} onDownloaded={markDownloaded} />}
        />
      )}
    </div>
  )
}
