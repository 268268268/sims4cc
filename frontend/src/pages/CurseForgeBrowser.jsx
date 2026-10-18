import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { DownloadSimple, ThumbsUp, HardDrives, Clock, ArrowUp, Check, MagnifyingGlass, ArrowsClockwise, Warning, Tray, CircleNotch, X, CaretLeft } from '@phosphor-icons/react'
import DownloadButton from '../components/DownloadButton'
import CurseForgeModDetail from '../components/CurseForgeModDetail'
import CategoryFilter from '../components/CategoryFilter'
import RecentAuthors from '../components/RecentAuthors'
import { pushAuthor } from '../lib/authorHistory'
import { formatBytes, formatCount, formatRelative } from '../lib/format'
import { pickLatestFile, RELEASE_TYPE } from '../lib/cfFile'
import { useT } from '../lib/i18n'

// CF sortField enum: 2=Popularity, 3=LastUpdated, 4=Name, 6=TotalDownloads
const SORT_OPTIONS = [
  { id: null, labelKey: 'curseforge.sortRelevance' },
  { id: 2, labelKey: 'curseforge.sortPopular' },
  { id: 3, labelKey: 'curseforge.sortUpdated' },
  { id: 6, labelKey: 'curseforge.sortDownloads' }
]

const DEBOUNCE_MS = 500
const SKELETON_COUNT = 10
const PAGE_SIZE = 50
// ponytail: CurseForge hard-caps index + pageSize at 10 000 — requests beyond that 400
const MAX_RESULT_WINDOW = 10000

const PLACEHOLDER_THUMB =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="120"><rect width="100%" height="100%" fill="#0c1a12"/><text x="50%" y="50%" font-size="40" text-anchor="middle" dy=".35em" fill="#1f6a4d">&#9670;</text></svg>'
  )

function getThumbnail(mod) {
  return mod?.logo?.thumbnailUrl || PLACEHOLDER_THUMB
}

// Author name(s) as clickable links → opens that author's mods. stopPropagation
// so clicking the nick inside a card doesn't also open the mod detail.
function AuthorLine({ mod, onOpenAuthor, className = '' }) {
  const { t } = useT()
  const authors = mod?.authors?.length ? mod.authors : null
  if (!authors) return <p className={`text-emerald-400 text-xs truncate ${className}`}>{t('curseforge.unknownAuthor')}</p>
  return (
    <p className={`text-xs truncate ${className}`} title={authors.map(a => a.name).join(', ')}>
      {authors.map((a, i) => (
        <span key={a.id ?? a.name}>
          {i > 0 && <span className="text-gray-600">, </span>}
          {a.id != null && onOpenAuthor ? (
            <button onClick={(e) => { e.stopPropagation(); onOpenAuthor(a) }} className="text-emerald-400 hover:text-emerald-300 hover:underline">
              {a.name}
            </button>
          ) : <span className="text-emerald-400">{a.name}</span>}
        </span>
      ))}
    </p>
  )
}

function SortChips({ sortField, onSortChange }) {
  const { t } = useT()
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-gray-600 text-xs">{t('localMods.sort')}:</span>
      {SORT_OPTIONS.map(s => (
        <button key={String(s.id)} onClick={() => onSortChange(s.id)} className={`chip ${sortField === s.id ? 'chip-active' : ''}`}>
          {t(s.labelKey)}
        </button>
      ))}
    </div>
  )
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

function ModCard({ mod, installed, hasUpdate, onInstalled, onOpen, onOpenAuthor }) {
  const { t } = useT()
  const latest = pickLatestFile(mod)
  const size = formatBytes(latest?.fileLength)
  const downloads = formatCount(mod.downloadCount)
  const thumbs = mod.thumbsUpCount > 0 ? formatCount(mod.thumbsUpCount) : null
  const updated = formatRelative(mod.dateModified)
  const release = RELEASE_TYPE[latest?.releaseType]

  return (
    <div
      onClick={() => onOpen(mod)}
      className={`card card-hover flex flex-col cursor-pointer ${hasUpdate ? 'ring-1 ring-amber-500/50' : installed ? 'ring-1 ring-emerald-500/40' : ''}`}
      title="Click for details"
    >
      <div className="relative">
        <img
          src={getThumbnail(mod)}
          alt={mod.name}
          loading="lazy"
          className="w-full h-32 object-cover bg-[#181b2a]"
        />
        {hasUpdate ? (
          <span className="absolute top-2 right-2 badge bg-amber-500/90 text-black font-semibold shadow-md backdrop-blur-sm">
            <ArrowUp size={11} weight="bold" /> {t('curseforge.updateAvailable')}
          </span>
        ) : installed && (
          <span className="absolute top-2 right-2 badge bg-emerald-600/90 text-white shadow-md shadow-emerald-950/40 backdrop-blur-sm">
            <Check size={11} weight="bold" /> {t('curseforge.installedBadge')}
          </span>
        )}
        {release && (
          <span className={`absolute top-2 left-2 badge ${release.cls} backdrop-blur-sm`} title={release.title}>
            {release.label}
          </span>
        )}
      </div>
      <div className="p-3 flex flex-col gap-1 flex-1">
        <p className="text-white font-semibold text-sm leading-tight line-clamp-2" title={mod.name}>
          {mod.name}
        </p>
        <AuthorLine mod={mod} onOpenAuthor={onOpenAuthor} />
        {mod.summary && (
          <p className="text-gray-500 text-xs leading-snug line-clamp-3 mt-1" title={mod.summary}>
            {mod.summary}
          </p>
        )}
        <div className="flex items-center gap-2.5 mt-1 text-gray-500 text-[11px] flex-wrap">
          {downloads && <span className="inline-flex items-center gap-1" title={t('curseforge.downloadsTip', { count: mod.downloadCount?.toLocaleString() })}><DownloadSimple size={12} weight="bold" /> {downloads}</span>}
          {thumbs && <span className="inline-flex items-center gap-1" title={t('curseforge.thumbsUpTip', { count: mod.thumbsUpCount?.toLocaleString() })}><ThumbsUp size={12} weight="fill" /> {thumbs}</span>}
          {size && <span className="inline-flex items-center gap-1" title={t('curseforge.fileSize')}><HardDrives size={12} weight="regular" /> {size}</span>}
          {updated && <span className="inline-flex items-center gap-1" title={t('curseforge.lastUpdated')}><Clock size={12} weight="regular" /> {updated}</span>}
        </div>
        <DownloadButton
          mod={mod}
          installed={installed}
          mode={hasUpdate ? 'update' : 'download'}
          onInstalled={onInstalled}
          className="mt-3 px-3 py-1.5 text-xs"
        />
      </div>
    </div>
  )
}

function InstalledView({ updateInfo, checking, filter, downloadedIds, onInstalled, onOpen, onOpenAuthor, onRecheck, onUpdateAll, updatingAll }) {
  const { t } = useT()
  if (checking && !updateInfo) {
    return (
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    )
  }
  if (!updateInfo) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
        <Tray size={52} weight="thin" className="text-emerald-500/30" />
        <p className="text-sm">{t('curseforge.noneInstalled')}</p>
      </div>
    )
  }

  const metaById = new Map(updateInfo.updates.map(u => [u.modId, u]))
  let mods = updateInfo.mods
  if (filter === 'updates') mods = mods.filter(m => metaById.get(m.id)?.updateAvailable)
  const missing = updateInfo.updates.filter(u => !u.found)
  const updatesCount = updateInfo.updates.filter(u => u.updateAvailable).length
  // All mods can be updated in 1 click via direct CDN fallback
  const updatable = updateInfo.mods.filter(m => metaById.get(m.id)?.updateAvailable === true)
  const blockedCount = 0

  if (!mods.length && !missing.length) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
        {filter === 'updates'
          ? <Check size={52} weight="bold" className="text-emerald-500/70" />
          : <Tray size={52} weight="thin" className="text-emerald-500/30" />}
        <p className="text-sm">
          {filter === 'updates' ? t('curseforge.upToDate') : t('curseforge.noneInstalled')}
        </p>
        {filter === 'updates' && (
          <button onClick={onRecheck} className="btn-ghost px-3 py-1.5 text-xs"><ArrowsClockwise size={14} weight="bold" /> {t('curseforge.recheck')}</button>
        )}
      </div>
    )
  }

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-gray-500 text-xs">
          {t('curseforge.installedModsCount', { count: mods.length })}
          {updatesCount > 0 && <span className="text-amber-400"> · {t('curseforge.updatesAvailableSuffix', { count: updatesCount })}</span>}
          {blockedCount > 0 && <span className="text-gray-600"> · {t('curseforge.blockedSuffix', { count: blockedCount })}</span>}
        </p>
        {updatable.length > 0 && (
          <button
            onClick={() => onUpdateAll(updatable)}
            disabled={!!updatingAll}
            title={blockedCount > 0 ? t('curseforge.blockedTitle', { count: blockedCount }) : undefined}
            className="btn-primary px-3 py-1.5 text-xs shrink-0"
          >
            {updatingAll
              ? <><span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" /> {t('curseforge.updatingProgress', { done: updatingAll.done, total: updatingAll.total })}</>
              : <><ArrowsClockwise size={14} weight="bold" /> {t('curseforge.updateAllCount', { count: updatable.length })}</>}
          </button>
        )}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>
        {mods.map(mod => (
          <ModCard
            key={mod.id}
            mod={mod}
            installed  // everything in this list is installed (downloaded or fingerprint-matched)
            hasUpdate={metaById.get(mod.id)?.updateAvailable === true}
            onInstalled={onInstalled}
            onOpen={onOpen}
            onOpenAuthor={onOpenAuthor}
          />
        ))}
      </div>
      {missing.length > 0 && (
        <div className="mt-6">
          <p className="text-gray-600 text-xs mb-2">{t('curseforge.noLongerOnCf')}</p>
          <div className="flex flex-col gap-1">
            {missing.map(u => (
              <p key={u.modId} className="text-gray-500 text-xs flex items-center gap-1.5"><X size={12} weight="bold" className="text-red-400/70" /> {u.name ?? t('curseforge.modNumber', { id: u.modId })}</p>
            ))}
          </div>
        </div>
      )}
    </>
  )
}

export default function CurseForgeBrowser({ pendingAuthor, onNavigateAuthor, onPendingAuthorConsumed }) {
  const { t } = useT()
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
  const [classes, setClasses] = useState([])       // top-level site sections
  const [categories, setCategories] = useState([]) // leaf categories
  const [classId, setClassId] = useState(null)     // null = all sections
  const [categoryIds, setCategoryIds] = useState([]) // multi-select leaf filters (AND)
  const [sortField, setSortField] = useState(2)    // default: Popularity (avoids the raw-upload firehose)
  const [view, setView] = useState('browse') // browse | installed
  const [authorView, setAuthorView] = useState(null) // { id, name, avatarUrl } | null
  const [installedFilter, setInstalledFilter] = useState('all') // all | updates
  const [updateInfo, setUpdateInfo] = useState(null) // { checkedAt, updates, mods }
  const [checking, setChecking] = useState(false)

  // ponytail: track latest in-flight request so stale results don't overwrite newer ones
  const reqIdRef = useRef(0)
  const timerRef = useRef(null)
  // filter the current mod list was fetched with — pagination must follow this,
  // not searchQuery, which changes on every keystroke before the debounce fires
  const activeFilterRef = useRef('')
  // category + sort the current list was fetched with — pagination carries them too
  const activeCategoryRef = useRef(null)
  const activeSortRef = useRef(null)
  const scrollRootRef = useRef(null)
  const loadMoreRef = useRef(null)
  // browse state snapshot taken when entering author view, restored on "Back"
  const preAuthorRef = useRef(null)
  // scrollTop to reapply once after a restore fetch settles (best-effort)
  const restoreScrollRef = useRef(null)

  const fetchPage = useCallback((filter, page, filters, sort) => {
    const reqId = ++reqIdRef.current
    const append = page > 0
    if (append) {
      setIsLoadingMore(true)
      setLoadMoreFailed(false)
    } else {
      activeFilterRef.current = filter
      activeCategoryRef.current = filters ?? { classId: null, categoryIds: [] }
      activeSortRef.current = sort ?? null
      setIsLoading(true)
      // ponytail: a superseded in-flight append never reaches its own .finally
      // (reqId guard), so the new search must clear its flag or the observer
      // guard blocks every future append — permanent spinner, dead scroll
      setIsLoadingMore(false)
      setIsError(false)
      setLoadMoreFailed(false)
      setHasMore(true)
    }
    const params = { searchFilter: filter, index: page * PAGE_SIZE, pageSize: PAGE_SIZE }
    const f = (append ? activeCategoryRef.current : filters) ?? { classId: null, categoryIds: [] }
    if (f.authorId != null) params.authorId = f.authorId // author view: ignore class/category
    else {
      if (f.classId != null) params.classId = f.classId
      if (f.categoryIds?.length) params.categoryIds = f.categoryIds
    }
    const srt = append ? activeSortRef.current : (sort ?? null)
    if (srt != null) params.sortField = srt
    window.api
      .searchCurseForge(params)
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
    fetchPage('', 0, { classId: null, categoryIds: [] }, sortField)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchPage])

  // Load the class + category lists once for the browse filters
  useEffect(() => {
    window.api.getCurseForgeCategories?.().then(res => {
      if (res?.classes?.length) setClasses(res.classes)
      if (res?.categories?.length) setCategories(res.categories)
    })
  }, [])

  // Re-run the browse from page 0 with the given filters, keeping search + sort
  const applyFilters = useCallback((cls, cats) => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (scrollRootRef.current) scrollRootRef.current.scrollTop = 0
    fetchPage(activeFilterRef.current, 0, { classId: cls, categoryIds: cats }, activeSortRef.current)
  }, [fetchPage])

  // Picking a top-level section: single-select. Switching class drops leaf filters
  // that don't belong to it (they'd AND to zero results).
  const onClassChange = (id) => {
    const nextClass = id === classId ? null : id
    const nextCats = nextClass == null
      ? categoryIds
      : categoryIds.filter(cid => categories.find(c => c.id === cid)?.classId === nextClass)
    setClassId(nextClass)
    setCategoryIds(nextCats)
    applyFilters(nextClass, nextCats)
  }

  // Toggling a leaf category: multi-select, AND-combined to narrow results
  const onCategoryToggle = (id) => {
    const next = categoryIds.includes(id) ? categoryIds.filter(c => c !== id) : [...categoryIds, id]
    setCategoryIds(next)
    applyFilters(classId, next)
  }

  // Picking a sort restarts from page 0, keeping search + filters
  const onSortChange = (id) => {
    setSortField(id)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (scrollRootRef.current) scrollRootRef.current.scrollTop = 0
    fetchPage(activeFilterRef.current, 0, activeCategoryRef.current, id)
  }

  // Enter the author view: snapshot the current browse state, then load only this
  // author's mods (keeping the active sort). Works from the grid or the detail modal.
  const openAuthor = useCallback((author) => {
    if (!author?.id) return
    if (!authorView) {
      // stash the ENTIRE browse feed (not just filters) so Back can restore it
      // without refetching — a page-0 refetch would lose the scrolled-in pages and
      // clamp the restored scroll position.
      preAuthorRef.current = {
        view, searchQuery, classId, categoryIds, sortField,
        scrollTop: scrollRootRef.current?.scrollTop ?? 0,
        mods, pageIndex, hasMore, totalCount, displayedFilter,
        activeFilter: activeFilterRef.current,
        activeFilters: activeCategoryRef.current,
        activeSort: activeSortRef.current
      }
    }
    if (timerRef.current) clearTimeout(timerRef.current)
    setSelectedMod(null)
    setView('browse')
    setAuthorView({ id: author.id, name: author.name, avatarUrl: author.avatarUrl })
    pushAuthor({ type: 'curseforge', id: author.id, name: author.name, avatarUrl: author.avatarUrl })
    if (scrollRootRef.current) scrollRootRef.current.scrollTop = 0
    fetchPage('', 0, { authorId: author.id, classId: null, categoryIds: [] }, sortField)
  }, [authorView, view, searchQuery, classId, categoryIds, sortField, mods, pageIndex, hasMore, totalCount, displayedFilter, fetchPage])

  // Open an author handed over from the shared history (possibly from another tab)
  useEffect(() => {
    if (pendingAuthor?.type === 'curseforge') {
      openAuthor({ id: pendingAuthor.id, name: pendingAuthor.name, avatarUrl: pendingAuthor.avatarUrl })
      onPendingAuthorConsumed?.()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAuthor])

  // Leave the author view: restore the snapshotted browse feed as-is (no refetch),
  // then reapply the scroll position — mirrors how Discover keeps its aggregate feed.
  const exitAuthor = useCallback(() => {
    const snap = preAuthorRef.current
    setAuthorView(null)
    if (snap && snap.mods?.length) {
      setView(snap.view)
      setSearchQuery(snap.searchQuery)
      setClassId(snap.classId)
      setCategoryIds(snap.categoryIds)
      setSortField(snap.sortField)
      setMods(snap.mods)
      setPageIndex(snap.pageIndex)
      setHasMore(snap.hasMore)
      setTotalCount(snap.totalCount)
      setDisplayedFilter(snap.displayedFilter)
      setIsLoading(false)
      activeFilterRef.current = snap.activeFilter
      activeCategoryRef.current = snap.activeFilters
      activeSortRef.current = snap.activeSort
      restoreScrollRef.current = snap.scrollTop
    } else {
      fetchPage('', 0, { classId: null, categoryIds: [] }, sortField)
    }
    preAuthorRef.current = null
  }, [fetchPage, sortField])

  // Reapply the saved scroll position once we're back on the (restored) browse feed
  useEffect(() => {
    if (!authorView && restoreScrollRef.current != null && scrollRootRef.current) {
      scrollRootRef.current.scrollTop = restoreScrollRef.current
      restoreScrollRef.current = null
    }
  }, [authorView])

  // Update check: session-cached in main; force re-checks everything
  const runUpdateCheck = useCallback(async (force) => {
    setChecking(true)
    try {
      const res = await window.api.checkCurseForgeUpdates?.({ force })
      if (res?.ok) setUpdateInfo(res)
      else if (res?.error) console.error('[CurseForge] update check failed:', res.error)
    } finally {
      setChecking(false)
    }
  }, [])

  // Entering the Installed view loads the (cached) check automatically; when that
  // result was served from the persisted disk cache, recompute once in the background.
  const bgRefreshedRef = useRef(false)
  useEffect(() => {
    if (view !== 'installed' || checking) return
    if (!updateInfo) runUpdateCheck(false)
    else if (updateInfo.fromCache && !bgRefreshedRef.current) {
      bgRefreshedRef.current = true
      runUpdateCheck(true)
    }
  }, [view, updateInfo, checking, runUpdateCheck])

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

  // A mod grabbed from its CurseForge page (download helper) is installed from the
  // toast, outside this page — reflect its Installed badge without a remount.
  useEffect(() => {
    const onInstalledElsewhere = (e) => {
      const id = e.detail?.modId
      if (id != null) markInstalled(id)
    }
    window.addEventListener('curseforge-installed', onInstalledElsewhere)
    return () => window.removeEventListener('curseforge-installed', onInstalledElsewhere)
  }, [markInstalled])

  // Update every app-updatable mod in turn (sequential — avoid hammering the CDN),
  // then re-check so freshly-updated mods drop off the list.
  const [updatingAll, setUpdatingAll] = useState(null) // { done, total } | null
  const handleUpdateAll = useCallback(async (targets) => {
    if (updatingAll || !targets?.length) return
    setUpdatingAll({ done: 0, total: targets.length })
    for (const m of targets) {
      let res
      try { res = await window.api.updateCurseForgeMod(m) } catch { res = { ok: false } }
      if (res?.ok) markInstalled(m.id)
      setUpdatingAll(s => (s ? { ...s, done: s.done + 1 } : s))
    }
    setUpdatingAll(null)
    await runUpdateCheck(true)
  }, [updatingAll, markInstalled, runUpdateCheck])

  // mods with a newer file on CF than the installed one
  const outdatedIds = useMemo(
    () => new Set((updateInfo?.updates ?? []).filter(u => u.updateAvailable).map(u => u.modId)),
    [updateInfo]
  )

  // Debounced search while typing — a new search always restarts from page 0
  const onSearchChange = (e) => {
    const value = e.target.value
    setSearchQuery(value)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(
      () => fetchPage(value, 0, activeCategoryRef.current, activeSortRef.current),
      DEBOUNCE_MS
    )
  }

  // Infinite scroll: observe the bottom marker; when it enters the (pre-extended)
  // viewport of the scroll container, fetch the next page and append.
  useEffect(() => {
    const node = loadMoreRef.current
    if (!node) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return
        if (view !== 'browse') return
        if (isLoading || isLoadingMore || isError || loadMoreFailed || !hasMore) return
        fetchPage(activeFilterRef.current, pageIndex + 1, activeCategoryRef.current, activeSortRef.current)
      },
      // ponytail: 300px rootMargin prefetches the next page just before the user
      // reaches the bottom, so scrolling feels continuous
      { root: scrollRootRef.current, rootMargin: '300px' }
    )
    observer.observe(node)
    return () => observer.disconnect()
    // mods.length re-attaches the observer when the marker (re)mounts with the grid
  }, [pageIndex, isLoading, isLoadingMore, hasMore, isError, loadMoreFailed, mods.length, view, fetchPage])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-white/5">
        <div className="mb-3">
          <h2 className="page-title">{t('curseforge.title')}</h2>
          <p className="page-subtitle">{t('curseforge.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {authorView ? (
            <>
              <button onClick={exitAuthor} className="btn-ghost px-3 py-1.5 text-xs">
                <CaretLeft size={14} weight="bold" /> {t('curseforge.back')}
              </button>
              <div className="flex items-center gap-2 min-w-0">
                {authorView.avatarUrl && <img src={authorView.avatarUrl} alt="" className="w-6 h-6 rounded-full" />}
                <span className="text-white font-semibold truncate">{authorView.name}</span>
                {totalCount != null && <span className="text-gray-500 text-xs">· {totalCount.toLocaleString()} {t('curseforge.modsWord')}</span>}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <SortChips sortField={sortField} onSortChange={onSortChange} />
                <RecentAuthors onPick={onNavigateAuthor} />
              </div>
            </>
          ) : (
          <>
          {/* Browse / Installed switch */}
          <div className="flex items-center gap-1.5">
            <button onClick={() => setView('browse')} className={`chip ${view === 'browse' ? 'chip-active' : ''}`}>
              {t('curseforge.browse')}
            </button>
            <button onClick={() => setView('installed')} className={`chip ${view === 'installed' ? 'chip-active' : ''}`}>
              {t('curseforge.installed')}
              {downloadedIds.size > 0 && (
                <span className="badge bg-emerald-600/40 text-emerald-200 ml-1">{downloadedIds.size}</span>
              )}
              {(updateInfo?.updates?.filter(u => u.updateAvailable).length ?? 0) > 0 && (
                <span className="badge bg-amber-500/70 text-black ml-1">
                  <ArrowUp size={10} weight="bold" /> {updateInfo.updates.filter(u => u.updateAvailable).length}
                </span>
              )}
            </button>
          </div>

          {view === 'browse' && (
            <>
              <div className="relative">
                <MagnifyingGlass size={16} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={onSearchChange}
                  placeholder={t('curseforge.searchPlaceholder')}
                  className="input w-full sm:w-72 pl-9 pr-3 py-2"
                />
              </div>
              {categories.length > 0 && (
                <CategoryFilter
                  categories={classId ? categories.filter(c => c.classId === classId) : categories}
                  selectedIds={categoryIds}
                  onToggle={onCategoryToggle}
                  onClear={() => { setCategoryIds([]); applyFilters(classId, []) }}
                />
              )}
              <SortChips sortField={sortField} onSortChange={onSortChange} />
              <div className="ml-auto"><RecentAuthors onPick={onNavigateAuthor} /></div>
              {/* Section chips (top-level classes) — own row via w-full in the wrap */}
              {classes.length > 0 && (
                <div className="w-full flex items-center gap-1.5 flex-wrap">
                  <button
                    onClick={() => onClassChange(null)}
                    className={`chip ${classId == null ? 'chip-active' : ''}`}
                  >
                    {t('curseforge.all')}
                  </button>
                  {classes.map(c => (
                    <button
                      key={c.id}
                      onClick={() => onClassChange(c.id)}
                      className={`chip ${classId === c.id ? 'chip-active' : ''}`}
                    >
                      {c.iconUrl && <img src={c.iconUrl} alt="" className="w-3.5 h-3.5 rounded-sm" />}
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}

          {view === 'installed' && (
            <>
              <div className="flex items-center gap-1.5">
                <button onClick={() => setInstalledFilter('all')} className={`chip ${installedFilter === 'all' ? 'chip-active' : ''}`}>
                  {t('curseforge.all')}
                </button>
                <button onClick={() => setInstalledFilter('updates')} className={`chip ${installedFilter === 'updates' ? 'chip-active' : ''}`}>
                  {t('curseforge.updatesOnly')}
                </button>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  onClick={() => runUpdateCheck(true)}
                  disabled={checking}
                  className="btn-ghost px-3 py-1.5 text-xs"
                >
                  {checking ? (
                    <>
                      <span className="animate-spin inline-block w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full" />
                      {t('curseforge.checkingShort')}
                    </>
                  ) : (
                    <><ArrowsClockwise size={14} weight="bold" /> {t('curseforge.checkUpdates')}{updateInfo?.checkedAt ? ` · ${new Date(updateInfo.checkedAt).toLocaleTimeString()}` : ''}</>
                  )}
                </button>
                <RecentAuthors onPick={onNavigateAuthor} />
              </div>
            </>
          )}
          </>
          )}
        </div>
      </div>

      {/* Body */}
      <div ref={scrollRootRef} className="flex-1 overflow-y-auto px-6 py-5">
        {view === 'installed' && (
          <InstalledView
            updateInfo={updateInfo}
            checking={checking}
            filter={installedFilter}
            downloadedIds={downloadedIds}
            onInstalled={markInstalled}
            onOpen={setSelectedMod}
            onOpenAuthor={openAuthor}
            onRecheck={() => runUpdateCheck(true)}
            onUpdateAll={handleUpdateAll}
            updatingAll={updatingAll}
          />
        )}

        {view === 'browse' && isError && (
          <div className="mb-4 banner-error flex items-center gap-2">
            <Warning size={16} weight="fill" className="shrink-0" /> {t('curseforge.fetchError')}
          </div>
        )}

        {view === 'browse' && isLoading && (
          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}
          >
            {Array.from({ length: SKELETON_COUNT }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {view === 'browse' && !isLoading && !isError && mods.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <MagnifyingGlass size={52} weight="thin" className="text-emerald-500/30" />
            <p className="text-sm">{displayedFilter ? t('curseforge.noModsFor', { query: displayedFilter }) : t('curseforge.noMods')}</p>
          </div>
        )}

        {view === 'browse' && !isLoading && !isError && mods.length > 0 && (
          <>
            <p className="text-gray-500 text-xs mb-4">
              {totalCount != null && totalCount > mods.length
                ? t('curseforge.showingOf', { shown: mods.length.toLocaleString(), total: totalCount.toLocaleString() })
                : t('curseforge.modsSimple', { count: mods.length.toLocaleString() })}
              {displayedFilter && ` · ${t('curseforge.resultsFor', { query: displayedFilter })}`}
              {classId && (() => {
                const c = classes.find(x => x.id === classId)
                return c ? ` · ${t('curseforge.inClass', { name: c.name })}` : null
              })()}
              {categoryIds.length > 0 && ` · ${t('curseforge.filtersCount', { count: categoryIds.length })}`}
              {(() => {
                const n = mods.reduce((c, m) => c + (downloadedIds.has(m.id) ? 1 : 0), 0)
                return n > 0 ? <span className="text-emerald-400"> · {t('curseforge.installedSuffix', { count: n })}</span> : null
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
                  hasUpdate={outdatedIds.has(mod.id)}
                  onInstalled={markInstalled}
                  onOpen={setSelectedMod}
                  onOpenAuthor={openAuthor}
                />
              ))}
            </div>

            {/* Infinite-scroll bottom marker + status row */}
            <div id="load-more-trigger" ref={loadMoreRef} className="h-px" />
            {isLoadingMore && (
              <div className="flex items-center justify-center gap-2 py-6 text-gray-500 text-xs">
                <CircleNotch size={16} weight="bold" className="animate-spin text-emerald-400" />
                Loading more mods…
              </div>
            )}
            {loadMoreFailed && (
              <div className="flex flex-col items-center gap-2 py-6">
                <p className="text-red-400 text-xs flex items-center gap-1.5"><Warning size={14} weight="fill" /> Failed to load more mods.</p>
                <button
                  onClick={() => fetchPage(activeFilterRef.current, pageIndex + 1, activeCategoryRef.current, activeSortRef.current)}
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
          hasUpdate={outdatedIds.has(selectedMod.id)}
          onInstalled={markInstalled}
          onClose={() => setSelectedMod(null)}
          onOpenAuthor={openAuthor}
        />
      )}
    </div>
  )
}
