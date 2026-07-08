import { useState, useCallback, useEffect, useMemo } from 'react'
import { Package, FileZip, CircleNotch, UploadSimple, Trash, ArrowsClockwise, MagnifyingGlass, Warning, X, FolderDashed } from '@phosphor-icons/react'
import SourceIcon from '../components/SourceIcon'
import LocalModDetail from '../components/LocalModDetail'
import CurseForgeModDetail from '../components/CurseForgeModDetail'
import ConfirmDialog from '../components/ConfirmDialog'
import { formatBytes, formatDate } from '../lib/format'
import { markChanged } from '../lib/sessionActivity'

const TYPE_LABEL = { package: '.package', ts4script: '.ts4script', archive: '.zip', unknown: '?' }
const TYPE_COLOR = {
  package: 'bg-emerald-600/30 text-emerald-200',
  ts4script: 'bg-sky-600/30 text-sky-200',
  archive: 'bg-amber-600/30 text-amber-200',
  unknown: 'bg-gray-700 text-gray-300'
}

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'enabled', label: 'Enabled' },
  { id: 'disabled', label: 'Disabled' },
  { id: 'package', label: 'Packages' },
  { id: 'ts4script', label: 'Scripts' },
  { id: 'archive', label: 'Archives' }
]

const SORTS = [
  { id: 'name', label: 'Name' },
  { id: 'date', label: 'Newest' },
  { id: 'size', label: 'Size' }
]

function ModThumbnail({ absPath, imageUrl }) {
  const [url, setUrl] = useState(null)
  const [tried, setTried] = useState(false)
  const [remoteFailed, setRemoteFailed] = useState(false)

  // Remote catalog image takes priority — until it 404s, then fall through to local
  if (imageUrl && !remoteFailed) {
    return (
      <img
        src={imageUrl}
        alt="thumbnail"
        loading="lazy"
        className="w-full h-32 object-cover"
        onError={() => setRemoteFailed(true)}
      />
    )
  }

  // Lazy-resolve the modimg:// URL via preload on first render
  if (!tried && absPath) {
    setTried(true)
    window.api.getImageUrl(absPath).then(u => setUrl(u))
  }

  if (url) {
    return (
      <img
        src={url}
        alt="thumbnail"
        loading="lazy"
        className="w-full h-32 object-cover"
        onError={() => setUrl(null)}
      />
    )
  }

  return (
    <div className="w-full h-32 bg-gradient-to-br from-emerald-950/30 to-black/20 flex items-center justify-center select-none">
      <Package size={40} weight="thin" className="text-emerald-300/40" />
    </div>
  )
}

function ArchiveCard({ mod, pending, onExtract, onOpen }) {
  return (
    <div
      onClick={() => onOpen(mod)}
      className="card card-hover flex flex-col border-amber-500/20 cursor-pointer"
      title="Click for details"
    >
      <div className="w-full h-32 bg-gradient-to-br from-amber-950/40 to-black/20 flex items-center justify-center select-none">
        <FileZip size={40} weight="thin" className="text-amber-300/60" />
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-white font-semibold text-sm leading-tight truncate" title={mod.name}>
          {mod.name}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge font-mono ${TYPE_COLOR.archive}`}>{TYPE_LABEL.archive}</span>
          <span className="badge bg-amber-900/40 text-amber-300">not installed</span>
        </div>
        <p className="text-gray-500 text-xs">{formatBytes(mod.size)}</p>
        <p className="text-gray-600 text-xs truncate mt-auto pt-1" title={mod.relativePath}>
          {mod.relativePath}
        </p>
        <button
          onClick={(e) => { e.stopPropagation(); onExtract(mod) }}
          disabled={pending}
          className="btn-primary mt-2 px-3 py-1.5 text-xs"
        >
          {pending
            ? <><CircleNotch size={14} weight="bold" className="animate-spin" /> Extracting…</>
            : <><UploadSimple size={14} weight="bold" /> Extract to Mods</>}
        </button>
      </div>
    </div>
  )
}

function ModCard({ mod, pending, onToggle, onOpen, onDelete, onOpenCf, cfMatch, catalogMeta }) {
  const creatorName = catalogMeta?.creatorName
  const imageUrl = catalogMeta?.imageUrl
  const tags = catalogMeta?.tags

  return (
    <div
      onClick={() => onOpen(mod)}
      className={`card card-hover flex flex-col cursor-pointer ${mod.enabled ? '' : 'opacity-70 saturate-50'}`}
      title="Click for details"
    >
      <ModThumbnail absPath={mod.thumbnail?.path ?? null} imageUrl={imageUrl} />

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-white font-semibold text-sm leading-tight truncate" title={mod.name}>
          {mod.name}
        </p>

        {(creatorName || mod.author) && (
          <p className="text-emerald-400 text-xs truncate" title={creatorName || mod.author}>
            {creatorName || mod.author}
          </p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`badge font-mono ${TYPE_COLOR[mod.type]}`}>
            {TYPE_LABEL[mod.type]}
          </span>
          <span className={`badge ${mod.enabled ? 'bg-emerald-800/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
            {mod.enabled ? 'enabled' : 'disabled'}
          </span>
          {mod.kinds?.map(k => (
            <span key={k} className="badge bg-white/5 text-gray-400">{k}</span>
          ))}
          {cfMatch && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenCf(cfMatch) }}
              className="badge bg-orange-600/30 text-orange-200 hover:bg-orange-600/50 transition-colors"
              title="From CurseForge — view details"
            >
              <SourceIcon type="curseforge" size={11} /> CF
            </button>
          )}
          {cfMatch?.hasUpdate && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenCf(cfMatch) }}
              className="badge bg-amber-600/30 text-amber-200 hover:bg-amber-600/50 transition-colors"
              title="A newer file is available on CurseForge — click to update"
            >
              <ArrowsClockwise size={11} weight="bold" /> update
            </button>
          )}
        </div>

        {tags?.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {tags.map(t => (
              <span key={t} className="badge bg-white/5 text-gray-400">{t}</span>
            ))}
          </div>
        )}

        <p className="text-gray-500 text-xs">
          {formatBytes(mod.size)}
          {mod.folderFiles > 1 && mod.folderSize > mod.size && (
            <span className="text-gray-600"> · folder {formatBytes(mod.folderSize)} ({mod.folderFiles})</span>
          )}
          {mod.dateAdded && <span className="text-gray-600"> · added {formatDate(mod.dateAdded)}</span>}
        </p>

        <p className="text-gray-600 text-xs truncate mt-auto pt-1" title={mod.relativePath}>
          {mod.relativePath}
        </p>

        <div className="flex items-center gap-1.5 mt-2">
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(mod) }}
            disabled={pending}
            className={`${mod.enabled ? 'btn-danger' : 'btn-success'} flex-1 px-3 py-1.5 text-xs`}
          >
            {pending ? '…' : mod.enabled ? 'Disable' : 'Enable'}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(mod) }}
            disabled={pending}
            className="btn-ghost px-2.5 py-1.5 text-xs"
            title="Move to Recycle Bin"
          >
            <Trash size={14} weight="regular" />
          </button>
        </div>
      </div>
    </div>
  )
}

export default function LocalMods({ modsFolder }) {
  const [state, setState] = useState('idle') // idle | loading | done | error
  const [result, setResult] = useState(null)
  const [errorMsg, setErrorMsg] = useState(null)
  const [busyPath, setBusyPath] = useState(null) // filePath being toggled/extracted
  const [actionError, setActionError] = useState(null)
  const [catalog, setCatalog] = useState({ creators: [], items: [] })
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [sort, setSort] = useState('name')
  const [dense, setDense] = useState(() => localStorage.getItem('mods-dense') === '1')
  const toggleDense = () => setDense(d => { localStorage.setItem('mods-dense', d ? '0' : '1'); return !d })
  const [selectedMod, setSelectedMod] = useState(null) // detail modal target
  const [confirmTarget, setConfirmTarget] = useState(null) // mod pending delete confirmation
  const [cfRecords, setCfRecords] = useState([]) // [{pathLower, modId, name}] from downloads.json
  const [cfFinger, setCfFinger] = useState({}) // filePathLower -> { modId, name, hasUpdate } from CF fingerprint match
  const [cfDetailMod, setCfDetailMod] = useState(null) // full CF mod for the modal
  const [cfDetailLoading, setCfDetailLoading] = useState(false)

  // Fetch remote catalog on mount
  useEffect(() => {
    window.api.getCatalog().then(cat => {
      if (cat) setCatalog(cat)
    })
  }, [])

  // Build lookup: creatorId → creator name
  const creatorMap = useMemo(() => {
    const m = new Map()
    for (const c of catalog.creators) m.set(c.id, c.name)
    return m
  }, [catalog.creators])

  // ponytail: O(n*m) substring scan — fine for hundreds of mods; upgrade to trie if catalog exceeds ~5k items
  const catalogMetaFor = useCallback((fileName) => {
    for (const item of catalog.items) {
      if (!item.filenamePatterns?.length) continue
      const matched = item.filenamePatterns.some(p => fileName.includes(p))
      if (matched) {
        return {
          imageUrl: item.imageUrl || null,
          creatorName: creatorMap.get(item.creatorId) || null,
          tags: item.tags || []
        }
      }
    }
    return null
  }, [catalog.items, creatorMap])

  // silent=true: background revalidate — keep showing the cached list, swap in
  // fresh results on success, and stay quiet on failure (no spinner, no error flip)
  const scan = useCallback(async (silent = false) => {
    if (!silent) setState('loading')
    setErrorMsg(null)
    try {
      const res = await window.api.scanLocalMods()
      if (!res.ok) {
        if (!silent) {
          setErrorMsg(res.errors?.[0]?.message ?? 'Scan failed.')
          setState('error')
        }
      } else {
        setResult(res)
        setState('done')
      }
    } catch (err) {
      if (!silent) {
        setErrorMsg(err.message)
        setState('error')
      }
    }
  }, [])

  // On mount: restore cache if present, otherwise auto-scan — no manual button press needed
  useEffect(() => {
    let cancelled = false
    window.api.getCachedLocalMods().then(mods => {
      if (cancelled) return
      if (Array.isArray(mods) && mods.length > 0) {
        setResult({ mods, count: mods.length, errors: [], scannedAt: null })
        setState('done')
        scan(true) // revalidate in the background — launch feels instant
      } else {
        scan()
      }
    })
    return () => { cancelled = true }
  }, [scan])

  // "Installed from CurseForge" matching data
  useEffect(() => {
    let cancelled = false
    window.api.getDownloadedCurseForge?.().then(rec => {
      if (cancelled || !rec) return
      setCfRecords(Object.entries(rec)
        .filter(([, r]) => r?.path)
        .map(([modId, r]) => ({ modId: Number(modId), name: r.name, pathLower: r.path.toLowerCase() })))
    })
    return () => { cancelled = true }
  }, [])

  // DropZone (or any other actor) changed files on disk while we're mounted
  useEffect(() => {
    const onChanged = () => scan()
    window.addEventListener('local-mods-changed', onChanged)
    return () => window.removeEventListener('local-mods-changed', onChanged)
  }, [scan])

  // Identify which local files are CurseForge mods by fingerprint (covers mods
  // installed outside the app) and whether an update exists.
  useEffect(() => {
    if (state !== 'done' || !result?.mods?.length) return
    let cancelled = false
    window.api.matchLocalCurseForge?.().then(map => {
      if (!cancelled && map) setCfFinger(map)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [state, result])

  // local mod → CurseForge match. Fingerprint is authoritative (has update info);
  // fall back to the downloads.json path record for app-installed mods.
  const cfMatchFor = useCallback((mod) => {
    const p = mod.filePath?.toLowerCase()
    if (!p) return null
    const fp = cfFinger[p]
    if (fp) return { modId: fp.modId, name: fp.name, hasUpdate: fp.hasUpdate }
    const rec = cfRecords.find(r => p === r.pathLower || p.startsWith(r.pathLower + '\\'))
    return rec ? { modId: rec.modId, name: rec.name, hasUpdate: false } : null
  }, [cfFinger, cfRecords])

  // open the CurseForge detail modal for a matched local mod
  const openCfDetail = useCallback(async (match) => {
    if (cfDetailLoading) return
    setCfDetailLoading(true)
    setActionError(null)
    try {
      const res = await window.api.getCurseForgeModsByIds([match.modId])
      const mod = res?.data?.[0]
      if (mod) setCfDetailMod(mod)
      else setActionError(`"${match.name ?? 'Mod'}" is no longer available on CurseForge.`)
    } catch (err) {
      setActionError(err.message)
    } finally {
      setCfDetailLoading(false)
    }
  }, [cfDetailLoading])

  const handleToggle = useCallback(async (mod) => {
    if (busyPath) return // one file action at a time
    setActionError(null)
    setBusyPath(mod.filePath)
    try {
      const res = await window.api.toggleLocalModEnabled(mod.filePath, !mod.enabled)
      if (!res.ok) {
        setActionError(res.error?.message ?? 'Toggle failed.')
        return
      }
      markChanged()
      // Replace only the toggled mod in state — match by old filePath, then use returned mod
      setResult(prev => {
        if (!prev) return prev
        const mods = prev.mods.map(m =>
          m.filePath === res.oldPath ? res.mod : m
        )
        return { ...prev, mods, count: mods.length }
      })
    } catch (err) {
      setActionError(err.message)
    } finally {
      // only release the slot if it is still ours — another action may own it now
      setBusyPath(p => (p === mod.filePath ? null : p))
    }
  }, [busyPath])

  const handleExtract = useCallback(async (mod) => {
    if (busyPath) return // one file action at a time
    setActionError(null)
    setBusyPath(mod.filePath)
    try {
      const res = await window.api.extractLocalArchive(mod.filePath)
      if (!res.ok) {
        setActionError(res.error ?? 'Extraction failed.')
        return
      }
      markChanged()
      await scan() // the archive is gone, new files exist — full rescan is the honest refresh
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyPath(p => (p === mod.filePath ? null : p))
    }
  }, [busyPath, scan])

  // delete flow: card/detail asks → ConfirmDialog → actual trash
  const requestDelete = useCallback((mod) => {
    if (busyPath) return
    setConfirmTarget(mod)
  }, [busyPath])

  const handleDelete = useCallback(async (mod) => {
    setConfirmTarget(null)
    setSelectedMod(null)
    if (busyPath) return
    setActionError(null)
    setBusyPath(mod.filePath)
    try {
      const res = await window.api.deleteLocalMod(mod.filePath)
      if (!res.ok) {
        setActionError(res.error?.message ?? 'Delete failed.')
        return
      }
      markChanged()
      // drop every removed path from the current list without a full rescan
      const removed = new Set((res.removed ?? [mod.filePath]).map(p => p.toLowerCase()))
      setResult(prev => {
        if (!prev) return prev
        const mods = prev.mods.filter(m =>
          !removed.has(m.filePath.toLowerCase()) &&
          ![...removed].some(r => m.filePath.toLowerCase().startsWith(r + '\\'))
        )
        return { ...prev, mods, count: mods.length }
      })
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBusyPath(p => (p === mod.filePath ? null : p))
    }
  }, [busyPath])

  // search + filter + sort pipeline
  const visibleMods = useMemo(() => {
    let mods = result?.mods ?? []
    const q = query.trim().toLowerCase()
    if (q) {
      mods = mods.filter(m =>
        m.name?.toLowerCase().includes(q) ||
        m.author?.toLowerCase().includes(q) ||
        m.fileName?.toLowerCase().includes(q)
      )
    }
    if (filter === 'enabled') mods = mods.filter(m => m.enabled && m.type !== 'archive')
    else if (filter === 'disabled') mods = mods.filter(m => !m.enabled && m.type !== 'archive')
    else if (filter !== 'all') mods = mods.filter(m => m.type === filter)
    const sorted = [...mods]
    if (sort === 'name') sorted.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
    else if (sort === 'date') sorted.sort((a, b) => (b.modifiedAt ?? '').localeCompare(a.modifiedAt ?? ''))
    else if (sort === 'size') sorted.sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
    return sorted
  }, [result, query, filter, sort])

  const archiveCount = useMemo(
    () => (result?.mods ?? []).filter(m => m.type === 'archive').length,
    [result]
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-white/5 shrink-0">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="page-title">Local Mods</h2>
            {modsFolder && (
              <p className="page-subtitle truncate max-w-lg" title={modsFolder}>
                {modsFolder}
              </p>
            )}
          </div>

          <button
            onClick={scan}
            disabled={state === 'loading'}
            className="btn-primary px-4 py-2 text-sm"
          >
            {state === 'loading' ? (
              <>
                <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                Scanning…
              </>
            ) : (
              <><ArrowsClockwise size={16} weight="bold" /> Rescan</>
            )}
          </button>
        </div>

        {/* Toolbar: search / filter / sort */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <MagnifyingGlass size={16} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search name, author, file…"
              className="input w-72 pl-9 pr-3 py-2"
            />
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            {FILTERS.map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`chip ${filter === f.id ? 'chip-active' : ''}`}
              >
                {f.label}
                {f.id === 'archive' && archiveCount > 0 && (
                  <span className="badge bg-amber-600/40 text-amber-200 ml-1">{archiveCount}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-gray-600 text-xs">Sort:</span>
            {SORTS.map(s => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`chip ${sort === s.id ? 'chip-active' : ''}`}
              >
                {s.label}
              </button>
            ))}
            <button
              onClick={toggleDense}
              title="Toggle grid density"
              className={`chip ml-1 ${dense ? 'chip-active' : ''}`}
            >
              {dense ? 'Compact' : 'Comfort'}
            </button>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5">

        {/* Error */}
        {state === 'error' && (
          <div className="mb-4 banner-error flex items-center gap-2"><Warning size={16} weight="fill" /> {errorMsg}</div>
        )}

        {/* Scan errors (partial) */}
        {state === 'done' && result?.errors?.length > 0 && (
          <div className="mb-4 banner-warn">
            {result.errors.length} file(s) had errors during scan.
          </div>
        )}

        {/* Toggle / extract error */}
        {actionError && (
          <div className="mb-4 banner-error flex items-center justify-between">
            <span className="flex items-center gap-2"><Warning size={16} weight="fill" /> {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200"><X size={14} weight="bold" /></button>
          </div>
        )}

        {/* Loading */}
        {state === 'loading' && (
          <div
            className={`grid ${dense ? 'gap-2.5' : 'gap-4'}`}
            style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 150 : 200}px, 1fr))` }}
          >
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="card">
                <div className="w-full h-32 skeleton" />
                <div className="p-3 flex flex-col gap-2">
                  <div className="h-4 w-3/4 skeleton rounded" />
                  <div className="h-3 w-1/3 skeleton rounded" />
                  <div className="h-8 w-full skeleton rounded mt-2" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Empty scan */}
        {state === 'done' && result?.count === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <FolderDashed size={52} weight="thin" className="text-emerald-500/30" />
            <p className="text-sm">No mods found in this folder.</p>
            <p className="text-xs text-gray-700">Download something from the CurseForge tab to get started.</p>
          </div>
        )}

        {/* Empty filter result */}
        {state === 'done' && result?.count > 0 && visibleMods.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <MagnifyingGlass size={52} weight="thin" className="text-emerald-500/30" />
            <p className="text-sm">Nothing matches your search or filter.</p>
          </div>
        )}

        {/* Results */}
        {state === 'done' && visibleMods.length > 0 && (
          <>
            <p className="text-gray-500 text-xs mb-4">
              {visibleMods.length} of {result.count} item{result.count !== 1 ? 's' : ''}
              {result.scannedAt && ` · scanned ${new Date(result.scannedAt).toLocaleTimeString()}`}
            </p>
            <div className={`grid ${dense ? 'gap-2.5' : 'gap-4'}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 150 : 200}px, 1fr))` }}>
              {visibleMods.map(mod =>
                mod.type === 'archive' ? (
                  <ArchiveCard
                    key={mod.id}
                    mod={mod}
                    pending={busyPath === mod.filePath}
                    onExtract={handleExtract}
                    onOpen={setSelectedMod}
                  />
                ) : (
                  <ModCard
                    key={mod.id}
                    mod={mod}
                    pending={busyPath === mod.filePath}
                    onToggle={handleToggle}
                    onOpen={setSelectedMod}
                    onDelete={requestDelete}
                    onOpenCf={openCfDetail}
                    cfMatch={cfMatchFor(mod)}
                    catalogMeta={catalogMetaFor(mod.fileName)}
                  />
                )
              )}
            </div>
          </>
        )}
      </div>

      {selectedMod && (
        <LocalModDetail
          mod={selectedMod}
          catalogMeta={catalogMetaFor(selectedMod.fileName)}
          cfMatch={cfMatchFor(selectedMod)}
          onOpenCf={openCfDetail}
          onToggle={handleToggle}
          onDelete={requestDelete}
          onClose={() => setSelectedMod(null)}
        />
      )}

      {cfDetailMod && (
        <CurseForgeModDetail
          mod={cfDetailMod}
          installed
          onInstalled={() => {}}
          onClose={() => setCfDetailMod(null)}
        />
      )}

      {confirmTarget && (
        <ConfirmDialog
          title={`Delete "${confirmTarget.name}"?`}
          message="The file will be moved to the Recycle Bin (recoverable). Folders left empty are removed too."
          confirmLabel={<><Trash size={15} weight="bold" /> Delete</>}
          onConfirm={() => handleDelete(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}
    </div>
  )
}
