import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { Package, FileZip, CircleNotch, UploadSimple, Trash, ArrowsClockwise, MagnifyingGlass, Warning, X, FolderDashed, SquaresFour, Stack, Cube, Code, Sliders, Armchair, TShirt, Cards, CheckSquare, Square, ListChecks, CheckCircle, Prohibit, ShieldWarning, FloppyDisk } from '@phosphor-icons/react'
import SourceIcon from '../components/SourceIcon'
import Switch from '../components/Switch'
import ProfilesModal from '../components/ProfilesModal'
import ConflictsModal from '../components/ConflictsModal'
import PolycountModal from '../components/PolycountModal'
import SaveInspectorModal from '../components/SaveInspectorModal'
import LocalModDetail from '../components/LocalModDetail'
import CurseForgeModDetail from '../components/CurseForgeModDetail'
import ConfirmDialog from '../components/ConfirmDialog'
import Plumbob from '../components/Plumbob'
import { formatBytes, formatDate } from '../lib/format'
import { markChanged } from '../lib/sessionActivity'
import { useT } from '../lib/i18n'

const TYPE_LABEL = { package: '.package', ts4script: '.ts4script', archive: '.zip', unknown: '?' }
const TYPE_COLOR = {
  package: 'bg-emerald-600/30 text-emerald-200',
  ts4script: 'bg-sky-600/30 text-sky-200',
  archive: 'bg-amber-600/30 text-amber-200',
  unknown: 'bg-gray-700 text-gray-300'
}
// plain-language tooltip keys so the card badges aren't cryptic at a glance
const TYPE_HELP_KEY = {
  package: 'localMods.typeHelpPackage',
  ts4script: 'localMods.typeHelpScript',
  archive: 'localMods.typeHelpArchive',
  unknown: 'localMods.typeHelpUnknown'
}
const KIND_HELP_KEY = {
  CAS: 'localMods.kindCAS',
  Object: 'localMods.kindObject',
  Tuning: 'localMods.kindTuning',
  Animation: 'localMods.kindAnimation'
}

const FILTERS = [
  { id: 'all', labelKey: 'localMods.filterAll' },
  { id: 'enabled', labelKey: 'localMods.filterEnabled' },
  { id: 'disabled', labelKey: 'localMods.filterDisabled' },
  { id: 'package', labelKey: 'localMods.filterPackages' },
  { id: 'ts4script', labelKey: 'localMods.filterScripts' },
  { id: 'archive', labelKey: 'localMods.filterArchives' }
]

const SORTS = [
  { id: 'name', labelKey: 'localMods.sortName' },
  { id: 'date', labelKey: 'localMods.sortNewest' },
  { id: 'size', labelKey: 'localMods.sortSize' }
]

function getModImgUrl(absPath) {
  if (!absPath || typeof absPath !== 'string') return null
  if (!/\.(png|jpe?g|webp|gif)$/i.test(absPath)) return null
  return `/modimg?p=${encodeURIComponent(absPath)}`
}

function ModThumbnail({ absPath, imageUrl, mod, onOpen3D }) {
  const { t } = useT()
  const [remoteFailed, setRemoteFailed] = useState(false)
  const [localFailed, setLocalFailed] = useState(false)

  const localUrl = useMemo(() => getModImgUrl(absPath), [absPath])
  const finalSrc = (!remoteFailed && imageUrl) ? imageUrl : (!localFailed ? localUrl : null)

  const isScript = mod?.type === 'ts4script'
  const isObject = mod?.kinds?.includes('Object')
  const isCAS = mod?.kinds?.includes('CAS')
  const isTuning = mod?.kinds?.includes('Tuning')
  const has3D = Boolean(mod?.has3D)

  return (
    <div className="w-full h-44 bg-[#05080e] relative flex items-center justify-center overflow-hidden group select-none border-b border-white/5">
      {finalSrc ? (
        <img
          src={finalSrc}
          alt={mod?.name || 'thumbnail'}
          loading="lazy"
          className="max-h-full max-w-full object-contain p-2 transition-transform duration-200 group-hover:scale-105"
          onError={() => {
            if (imageUrl && !remoteFailed) setRemoteFailed(true)
            else setLocalFailed(true)
          }}
        />
      ) : (
        <div className="w-full h-full flex flex-col items-center justify-center gap-1.5 bg-[#0a0f0d] text-gray-500 border-b border-white/[0.04]">
          {isScript ? (
            <Code size={38} weight="thin" className="text-sky-400/50" />
          ) : isObject ? (
            <Armchair size={38} weight="thin" className="text-amber-400/50" />
          ) : isCAS ? (
            <TShirt size={38} weight="thin" className="text-emerald-400/50" />
          ) : isTuning ? (
            <Sliders size={38} weight="thin" className="text-purple-400/50" />
          ) : (
            <Package size={38} weight="thin" className="text-emerald-300/40" />
          )}
          <span className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
            {mod?.type === 'ts4script' ? t('localMods.badgeScript') : mod?.kinds?.[0] || t('localMods.badgeMod')}
          </span>
        </div>
      )}

      {/* Кнопка 3D прямо на карточке */}
      {has3D && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onOpen3D?.(mod)
          }}
          className="absolute top-2 right-2 px-2 py-1 rounded-md text-[10px] font-bold bg-[#0a0f0d]/90 hover:bg-emerald-600 text-emerald-300 hover:text-white border border-emerald-500/30 flex items-center gap-1 shadow-sm transition-colors"
          title={t('localMods.open3dTip')}
        >
          <Cube size={12} weight="bold" />
          <span>3D</span>
        </button>
      )}
    </div>
  )
}

function ArchiveCard({ mod, pending, onExtract, onOpen, selectMode, isSelected, onToggleSelect }) {
  const { t } = useT()
  return (
    <div
      onClick={() => {
        if (selectMode) onToggleSelect?.(mod.filePath)
        else onOpen(mod)
      }}
      className={`card card-hover flex flex-col border-amber-500/20 cursor-pointer relative transition-all ${
        isSelected ? 'ring-2 ring-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-950/30' : ''
      }`}
    >
      {selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.(mod.filePath)
          }}
          className={`absolute top-2 left-2 z-10 p-1 rounded-md transition-all ${
            isSelected
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
              : 'bg-black/60 text-gray-400 hover:text-white border border-white/10'
          }`}
          title={isSelected ? t('localMods.deselectCheckbox') : t('localMods.selectCheckbox')}
        >
          {isSelected ? <CheckSquare size={16} weight="fill" /> : <Square size={16} weight="regular" />}
        </button>
      )}
      <div className="w-full h-32 bg-[#120f09] flex items-center justify-center select-none border-b border-amber-900/20">
        <FileZip size={40} weight="thin" className="text-amber-300/60" />
      </div>
      <div className="p-3 flex flex-col gap-1.5 flex-1">
        <p className="text-white font-semibold text-sm leading-tight truncate" title={mod.name}>
          {mod.name}
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge font-mono ${TYPE_COLOR.archive}`}>{TYPE_LABEL.archive}</span>
          <span className="badge bg-amber-900/40 text-amber-300">{t('localMods.notInstalled')}</span>
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
            ? <><CircleNotch size={14} weight="bold" className="animate-spin" /> {t('localMods.extracting')}</>
            : <><UploadSimple size={14} weight="bold" /> {t('localMods.extractToMods')}</>}
        </button>
      </div>
    </div>
  )
}

function ModCard({ mod, pending, onToggle, onOpen, onDelete, onOpenCf, onOpen3D, cfMatch, catalogMeta, selectMode, isSelected, onToggleSelect }) {
  const { t } = useT()
  const creatorName = catalogMeta?.creatorName
  const imageUrl = catalogMeta?.imageUrl
  const tags = catalogMeta?.tags

  return (
    <div
      onClick={() => {
        if (selectMode) onToggleSelect?.(mod.filePath)
        else onOpen(mod)
      }}
      className={`card card-hover flex flex-col cursor-pointer relative transition-all ${
        isSelected ? 'ring-2 ring-emerald-500 bg-emerald-950/20 shadow-lg shadow-emerald-950/30' : ''
      } ${mod.enabled ? '' : 'opacity-70 saturate-50'}`}
    >
      {selectMode && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect?.(mod.filePath)
          }}
          className={`absolute top-2 left-2 z-10 p-1 rounded-md backdrop-blur-md transition-all ${
            isSelected
              ? 'bg-emerald-600 text-white shadow-md shadow-emerald-950/50'
              : 'bg-black/60 text-gray-400 hover:text-white border border-white/10'
          }`}
          title={isSelected ? t('localMods.deselectCheckbox') : t('localMods.selectCheckbox')}
        >
          {isSelected ? <CheckSquare size={16} weight="fill" /> : <Square size={16} weight="regular" />}
        </button>
      )}
      <ModThumbnail absPath={mod.thumbnail?.path ?? null} imageUrl={imageUrl} mod={mod} onOpen3D={onOpen3D} />

      <div className="p-3 flex flex-col gap-1.5 flex-1">
        {/* two lines: the distinguishing tail (…SKIN vs …TATTOO) survives instead
            of being cut by a single-line ellipsis. Full name is in the tooltip. */}
        <p className="text-white font-semibold text-sm leading-tight line-clamp-2 break-words" title={mod.name}>
          {mod.name}
        </p>

        {(creatorName || mod.author) && (
          <p className="text-emerald-400 text-xs truncate" title={creatorName || mod.author}>
            {creatorName || mod.author}
          </p>
        )}

        <div className="flex items-center gap-1.5 flex-wrap">
          <span className={`badge font-mono ${TYPE_COLOR[mod.type]}`} title={t(TYPE_HELP_KEY[mod.type])}>
            {TYPE_LABEL[mod.type]}
          </span>
          <span
            className={`badge ${mod.enabled ? 'bg-emerald-800/50 text-emerald-300' : 'bg-gray-700/60 text-gray-300'}`}
            title={mod.enabled ? t('localMods.enabledHelp') : t('localMods.disabledHelp')}
          >
            {mod.enabled ? t('common.enabled').toLowerCase() : t('common.disabled').toLowerCase()}
          </span>
          {mod.kinds?.map(k => (
            <span key={k} className="badge bg-white/5 text-gray-400" title={KIND_HELP_KEY[k] ? t(KIND_HELP_KEY[k]) : t('localMods.kindOther', { kind: k })}>{k}</span>
          ))}
          {cfMatch && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenCf(cfMatch) }}
              className="badge bg-orange-600/30 text-orange-200 hover:bg-orange-600/50 transition-colors"
              title={t('localMods.cfFrom')}
            >
              <SourceIcon type="curseforge" size={11} /> CF
            </button>
          )}
          {cfMatch?.hasUpdate && (
            <button
              onClick={(e) => { e.stopPropagation(); onOpenCf(cfMatch) }}
              className="badge bg-amber-600/30 text-amber-200 hover:bg-amber-600/50 transition-colors"
              title={t('localMods.cfUpdate')}
            >
              <ArrowsClockwise size={11} weight="bold" /> {t('localMods.update')}
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
            <span className="text-gray-600"> · {t('localMods.folderInfo', { size: formatBytes(mod.folderSize), count: mod.folderFiles })}</span>
          )}
          {mod.dateAdded && <span className="text-gray-600"> · {t('localMods.added', { date: formatDate(mod.dateAdded) })}</span>}
        </p>

        <p className="text-gray-600 text-xs truncate mt-auto pt-1" title={mod.relativePath}>
          {mod.relativePath}
        </p>

        <div className="flex items-center gap-2 mt-2" onClick={(e) => e.stopPropagation()}>
          <Switch
            on={mod.enabled}
            pending={pending}
            onClick={() => onToggle(mod)}
            title={mod.enabled ? t('localMods.enabledToggle') : t('localMods.disabledToggle')}
          />
          <span className="text-xs text-gray-400 select-none">
            {pending ? '…' : mod.enabled ? t('common.enabled') : t('common.disabled')}
          </span>
          <button
            onClick={() => onDelete(mod)}
            disabled={pending}
            className="btn-ghost ml-auto px-2.5 py-1.5 text-xs hover:text-red-300"
            title={t('localMods.moveToRecycle')}
          >
            <Trash size={14} weight="regular" />
          </button>
        </div>
      </div>
    </div>
  )
}

// In-memory cache in renderer so tab switching is instantaneous (0ms)
let memoryModsResult = null

export default function LocalMods({ modsFolder, onNavigate }) {
  const { t } = useT()
  const [result, setResult] = useState(() => memoryModsResult)
  const [state, setState] = useState(() => (memoryModsResult ? 'done' : 'loading'))
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
  const [openIn3D, setOpenIn3D] = useState(false)
  const [confirmTarget, setConfirmTarget] = useState(null) // mod pending delete confirmation
  const [selectMode, setSelectMode] = useState(false)
  const [selectedPaths, setSelectedPaths] = useState(() => new Set())
  const [batchBusy, setBatchBusy] = useState(false)
  const [confirmBatchDelete, setConfirmBatchDelete] = useState(false)
  const [displayLimit, setDisplayLimit] = useState(80)
  const sentinelRef = useRef(null)

  const toggleSelect = useCallback((filePath) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (next.has(filePath)) next.delete(filePath)
      else next.add(filePath)
      return next
    })
  }, [])

  const deselectAll = useCallback(() => {
    setSelectedPaths(new Set())
  }, [])

  const updateResult = useCallback((val) => {
    setResult(prev => {
      const next = typeof val === 'function' ? val(prev) : val
      memoryModsResult = next
      return next
    })
  }, [])

  const openModDetail = useCallback((mod, in3D = false) => {
    setOpenIn3D(in3D)
    setSelectedMod(mod)
  }, [])
  const [cfRecords, setCfRecords] = useState([]) // [{pathLower, modId, name}] from downloads.json
  const [cfFinger, setCfFinger] = useState({}) // filePathLower -> { modId, name, hasUpdate } from CF fingerprint match
  const lastMatchedScanKeyRef = useRef(null)
  const [cfDetailMod, setCfDetailMod] = useState(null) // full CF mod for the modal
  const [cfDetailLoading, setCfDetailLoading] = useState(false)
  const [showProfiles, setShowProfiles] = useState(false)
  const [showConflicts, setShowConflicts] = useState(false)
  const [showPolycount, setShowPolycount] = useState(false)
  const [showSaveInspector, setShowSaveInspector] = useState(false)

  // Fetch remote catalog on mount
  useEffect(() => {
    window.api.getCatalog().then(cat => {
      if (cat && typeof cat === 'object') {
        setCatalog({
          creators: Array.isArray(cat.creators) ? cat.creators : [],
          items: Array.isArray(cat.items) ? cat.items : []
        })
      }
    }).catch(() => {})
  }, [])

  // Build lookup: creatorId → creator name
  const creatorMap = useMemo(() => {
    const m = new Map()
    if (Array.isArray(catalog?.creators)) {
      for (const c of catalog.creators) m.set(c.id, c.name)
    }
    return m
  }, [catalog?.creators])

  // ponytail: O(n*m) substring scan — fine for hundreds of mods; upgrade to trie if catalog exceeds ~5k items
  const catalogMetaFor = useCallback((fileName) => {
    if (!Array.isArray(catalog?.items)) return null
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
  }, [catalog?.items, creatorMap])

  // silent=true: background revalidate — keep showing the cached list, swap in
  // fresh results on success, and stay quiet on failure (no spinner, no error flip)
  const scan = useCallback(async (silent = false) => {
    if (!silent) setState('loading')
    setErrorMsg(null)
    try {
      const res = await window.api.scanLocalMods()
      const isOk = Boolean(res?.ok || (Array.isArray(res?.mods) && res.mods.length > 0))
      if (!isOk) {
        if (!silent) {
          setErrorMsg(res?.errors?.[0]?.message ?? 'Scan failed.')
          setState('error')
        }
      } else {
        updateResult(res)
        setState('done')
      }
    } catch (err) {
      if (!silent) {
        setErrorMsg(err.message)
        setState('error')
      }
    }
  }, [updateResult])

  // On mount: restore cache if present, otherwise auto-scan — no manual button press needed
  useEffect(() => {
    let cancelled = false
    if (!memoryModsResult) {
      window.api.getCachedLocalMods().then(mods => {
        if (cancelled) return
        if (Array.isArray(mods) && mods.length > 0) {
          const initialRes = { mods, count: mods.length, errors: [], scannedAt: null }
          updateResult(initialRes)
          setState('done')
        } else {
          scan()
        }
      }).catch(() => {
        if (!cancelled) scan()
      })
    }
    return () => { cancelled = true }
  }, [scan, updateResult])

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
  // Delay background matching by 4 seconds after mods are rendered, and only run once per scan key.
  const scanKey = result?.scannedAt || (result?.mods?.length ? 'cached' : null)

  useEffect(() => {
    if (state !== 'done' || !scanKey) return
    let cancelled = false

    // Instantly show previous matches from disk cache without heavy computations
    window.api.matchLocalCurseForge?.({ cached: true }).then(map => {
      if (cancelled) return
      if (map && Object.keys(map).length) setCfFinger(map)
    }).catch(() => {})

    // Only run full background fingerprinting if it hasn't run for this scan yet
    if (lastMatchedScanKeyRef.current === scanKey) return

    const timer = setTimeout(() => {
      if (cancelled) return
      lastMatchedScanKeyRef.current = scanKey
      window.api.matchLocalCurseForge?.().then(map => {
        if (!cancelled && map) setCfFinger(map)
      }).catch(() => {})
    }, 4000)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [state, scanKey])

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
        setActionError(res.error?.message ?? res.error ?? 'Toggle failed.')
        return
      }
      markChanged()
      // Replace only the toggled mod in state — match by old filePath, then use returned mod
      updateResult(prev => {
        if (!prev) return prev
        const mods = prev.mods.map(m =>
          m.filePath === res.oldPath ? (res.mod ?? m) : m
        )
        return { ...prev, mods, count: mods.length }
      })
    } catch (err) {
      setActionError(err.message)
    } finally {
      // only release the slot if it is still ours — another action may own it now
      setBusyPath(p => (p === mod.filePath ? null : p))
    }
  }, [busyPath, updateResult])

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

  const [extractingAll, setExtractingAll] = useState(false)
  const handleExtractAll = useCallback(async () => {
    if (extractingAll || busyPath) return
    setActionError(null)
    setExtractingAll(true)
    try {
      const res = await window.api.extractAllArchives()
      if (!res.ok) { setActionError(res.error ?? 'Extraction failed.'); return }
      if (res.failed?.length) {
        setActionError(`${res.extracted} extracted, ${res.failed.length} failed: ${res.failed.map(f => f.name).join(', ')}`)
      }
      markChanged()
      await scan()
    } catch (err) {
      setActionError(err.message)
    } finally {
      setExtractingAll(false)
    }
  }, [extractingAll, busyPath, scan])

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
        setActionError(res.error?.message ?? res.error ?? 'Delete failed.')
        return
      }
      markChanged()
      // drop every removed path from the current list without a full rescan
      const removed = new Set((res.removed ?? [mod.filePath]).map(p => p.toLowerCase()))
      updateResult(prev => {
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
  }, [busyPath, updateResult])

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

  const displayedMods = useMemo(() => {
    return visibleMods.slice(0, displayLimit)
  }, [visibleMods, displayLimit])

  useEffect(() => {
    setDisplayLimit(80)
  }, [query, filter, sort])

  useEffect(() => {
    if (!sentinelRef.current) return
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) {
        setDisplayLimit(prev => Math.min(visibleMods.length, prev + 60))
      }
    }, { rootMargin: '400px' })
    observer.observe(sentinelRef.current)
    return () => observer.disconnect()
  }, [visibleMods.length, displayLimit])

  const selectAllVisible = useCallback(() => {
    setSelectedPaths(new Set(visibleMods.map(m => m.filePath)))
  }, [visibleMods])

  const handleBatchToggle = useCallback(async (targetEnabled) => {
    if (batchBusy || selectedPaths.size === 0) return
    setBatchBusy(true)
    setActionError(null)
    try {
      const paths = Array.from(selectedPaths)
      const res = await window.api.batchToggleLocalMods(paths, targetEnabled)
      if (!res.ok) {
        setActionError(res.error || t('localMods.batchErrorToggle'))
      } else {
        markChanged()
        const map = new Map((res.results || []).map(r => [r.oldPath, r.mod]))
        updateResult(prev => {
          if (!prev) return prev
          const mods = prev.mods.map(m => map.get(m.filePath) || m)
          return { ...prev, mods }
        })
        const newPaths = new Set()
        for (const r of (res.results || [])) {
          newPaths.add(r.mod.filePath)
        }
        setSelectedPaths(newPaths)
      }
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBatchBusy(false)
    }
  }, [batchBusy, selectedPaths, updateResult, t])

  const handleBatchDelete = useCallback(async () => {
    if (batchBusy || selectedPaths.size === 0) return
    setBatchBusy(true)
    setActionError(null)
    try {
      const paths = Array.from(selectedPaths)
      const res = await window.api.batchDeleteLocalMods(paths)
      if (!res.ok) {
        setActionError(res.error || t('localMods.batchErrorDelete'))
      } else {
        markChanged()
        const deletedSet = new Set((res.deleted || []).map(p => p.toLowerCase()))
        updateResult(prev => {
          if (!prev) return prev
          const mods = prev.mods.filter(m => !deletedSet.has(m.filePath.toLowerCase()))
          return { ...prev, mods, count: mods.length }
        })
        setSelectedPaths(new Set())
        setSelectMode(false)
      }
    } catch (err) {
      setActionError(err.message)
    } finally {
      setBatchBusy(false)
      setConfirmBatchDelete(false)
    }
  }, [batchBusy, selectedPaths, updateResult, t])

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-4 pb-3 border-b border-white/5 shrink-0">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="page-title">{t('localMods.title')}</h2>
            {modsFolder && (
              <p className="page-subtitle truncate max-w-lg" title={modsFolder}>
                {modsFolder}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
            <button
              onClick={() => onNavigate?.('cc-swiper')}
              className="btn-primary px-3 py-2 text-xs flex items-center gap-1.5 shrink-0"
              title={t('swiper.trashHint')}
            >
              <Cards size={16} weight="bold" />
              <span>CC Swiper</span>
            </button>
            <button
              onClick={() => setShowConflicts(true)}
              className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 border border-amber-500/20 text-amber-300 hover:bg-amber-950/30 transition-all shrink-0"
              title={t('conflicts.subtitle')}
            >
              <ShieldWarning size={15} weight="bold" />
              <span>{t('conflicts.title')}</span>
            </button>
            <button
              onClick={() => setShowPolycount(true)}
              className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 border border-purple-500/20 text-purple-300 hover:bg-purple-950/30 transition-all shrink-0"
              title={t('polycount.subtitle')}
            >
              <Cube size={15} weight="bold" />
              <span>{t('polycount.title')}</span>
            </button>
            <button
              onClick={() => setShowSaveInspector(true)}
              className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 border border-sky-500/20 text-sky-300 hover:bg-sky-950/30 transition-all shrink-0"
              title={t('saveInspector.subtitle')}
            >
              <FloppyDisk size={15} weight="bold" />
              <span>{t('saveInspector.title')}</span>
            </button>
            <button
              onClick={() => setShowProfiles(true)}
              className="btn-ghost px-3 py-2 text-xs flex items-center gap-1.5 shrink-0"
              title={t('profiles.title')}
            >
              <Stack size={15} weight="fill" /> {t('profiles.button')}
            </button>
            <button
              onClick={scan}
              disabled={state === 'loading'}
              className="btn-primary px-4 py-2 text-sm shrink-0"
            >
              {state === 'loading' ? (
                <>
                  <span className="animate-spin inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full" />
                  {t('localMods.scanning')}
                </>
              ) : (
                <><ArrowsClockwise size={16} weight="bold" /> {t('localMods.rescan')}</>
              )}
            </button>
          </div>
        </div>

        {/* Toolbar: search / filter / sort */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative">
            <MagnifyingGlass size={16} weight="bold" className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={t('localMods.searchPlaceholder')}
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
                {t(f.labelKey)}
                {f.id === 'archive' && archiveCount > 0 && (
                  <span className="badge bg-amber-600/40 text-amber-200 ml-1">{archiveCount}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-gray-600 text-xs">{t('localMods.sort')}:</span>
            {SORTS.map(s => (
              <button
                key={s.id}
                onClick={() => setSort(s.id)}
                className={`chip ${sort === s.id ? 'chip-active' : ''}`}
              >
                {t(s.labelKey)}
              </button>
            ))}
            <button
              onClick={toggleDense}
              title={t('localMods.compactHint')}
              className={`chip ml-1 ${dense ? 'chip-active' : ''}`}
            >
              <SquaresFour size={13} weight="bold" /> {t('localMods.compact')}
            </button>
            <button
              onClick={() => {
                setSelectMode(s => !s)
                if (selectMode) deselectAll()
              }}
              className={`chip ml-1 ${selectMode ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500/40' : ''}`}
              title={t('localMods.selectModeTip')}
            >
              <ListChecks size={14} weight="bold" />
              <span>{selectMode ? t('common.deselect') : t('common.select')}</span>
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
            {t('localMods.scanErrors', { count: result.errors.length })}
          </div>
        )}

        {/* Toggle / extract error */}
        {actionError && (
          <div className="mb-4 banner-error flex items-center justify-between">
            <span className="flex items-center gap-2"><Warning size={16} weight="fill" /> {actionError}</span>
            <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200"><X size={14} weight="bold" /></button>
          </div>
        )}

        {/* Initial mount: reading the cache off disk (can be slow on a big library) */}
        {state === 'idle' && (
          <div className="flex flex-col items-center justify-center h-64 gap-3">
            <Plumbob size={44} spin />
            <div className="text-gray-500 text-sm">{t('common.loading')}</div>
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
            <p className="text-sm">{t('localMods.noModsTitle')}</p>
            <p className="text-xs text-gray-700">{t('localMods.noModsHint')}</p>
          </div>
        )}

        {/* Empty filter result */}
        {state === 'done' && result?.count > 0 && visibleMods.length === 0 && (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <MagnifyingGlass size={52} weight="thin" className="text-emerald-500/30" />
            <p className="text-sm">{t('localMods.nothingMatches')}</p>
          </div>
        )}

        {/* Results */}
        {state === 'done' && visibleMods.length > 0 && (
          <>
            <div className="flex items-center justify-between mb-4 gap-3">
              <p className="text-gray-500 text-xs">
                {t('localMods.itemsCount', { shown: visibleMods.length, total: result.count, plural: result.count !== 1 ? 's' : '' })}
                {result.scannedAt && ` · ${t('localMods.scannedAt', { time: new Date(result.scannedAt).toLocaleTimeString() })}`}
              </p>
              {filter === 'archive' && archiveCount > 0 && (
                <button onClick={handleExtractAll} disabled={extractingAll || !!busyPath} className="btn-primary px-3 py-1.5 text-xs shrink-0">
                  {extractingAll
                    ? <><CircleNotch size={14} weight="bold" className="animate-spin" /> {t('localMods.extracting')}</>
                    : <><UploadSimple size={14} weight="bold" /> {t('localMods.extractAll', { count: archiveCount })}</>}
                </button>
              )}
            </div>
            <div className={`grid ${dense ? 'gap-2.5' : 'gap-4'}`} style={{ gridTemplateColumns: `repeat(auto-fill, minmax(${dense ? 150 : 200}px, 1fr))` }}>
              {displayedMods.map(mod =>
                mod.type === 'archive' ? (
                  <ArchiveCard
                    key={mod.id}
                    mod={mod}
                    pending={busyPath === mod.filePath}
                    onExtract={handleExtract}
                    onOpen={setSelectedMod}
                    selectMode={selectMode}
                    isSelected={selectedPaths.has(mod.filePath)}
                    onToggleSelect={toggleSelect}
                  />
                ) : (
                  <ModCard
                    key={mod.id}
                    mod={mod}
                    pending={busyPath === mod.filePath}
                    onToggle={handleToggle}
                    onOpen={(m) => openModDetail(m, false)}
                    onOpen3D={(m) => openModDetail(m, true)}
                    onDelete={requestDelete}
                    onOpenCf={openCfDetail}
                    cfMatch={cfMatchFor(mod)}
                    catalogMeta={catalogMetaFor(mod.fileName)}
                    selectMode={selectMode}
                    isSelected={selectedPaths.has(mod.filePath)}
                    onToggleSelect={toggleSelect}
                  />
                )
              )}
            </div>

            {displayedMods.length < visibleMods.length && (
              <div ref={sentinelRef} className="py-8 flex flex-col items-center justify-center gap-2 text-gray-500">
                <CircleNotch size={24} className="animate-spin text-emerald-400" />
                <span className="text-xs">{t('localMods.loadingMore', { count: Math.min(60, visibleMods.length - displayedMods.length), total: visibleMods.length - displayedMods.length })}</span>
              </div>
            )}
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
          initial3D={openIn3D}
          onClose={() => {
            setSelectedMod(null)
            setOpenIn3D(false)
          }}
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

      {showProfiles && <ProfilesModal onClose={() => setShowProfiles(false)} />}

      {confirmTarget && (
        <ConfirmDialog
          title={t('confirm.deleteTitle', { name: confirmTarget.name })}
          message={t('confirm.deleteMessage')}
          confirmLabel={<><Trash size={15} weight="bold" /> {t('common.delete')}</>}
          onConfirm={() => handleDelete(confirmTarget)}
          onCancel={() => setConfirmTarget(null)}
        />
      )}

      {/* Floating Batch Actions Bar */}
      {selectMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-[#0c121e]/95 backdrop-blur-md border border-emerald-500/30 rounded-2xl shadow-2xl px-5 py-3 flex items-center gap-4 text-white">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-400">
              {t('localMods.selectedCount', { count: selectedPaths.size })}
            </span>
            <button
              onClick={selectAllVisible}
              className="text-xs text-gray-300 hover:text-white underline ml-1"
            >
              {t('common.selectAll')} ({visibleMods.length})
            </button>
            <button
              onClick={deselectAll}
              className="text-xs text-gray-400 hover:text-white underline ml-1"
            >
              {t('common.reset')}
            </button>
          </div>

          <div className="h-4 w-px bg-white/10" />

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleBatchToggle(true)}
              disabled={batchBusy || selectedPaths.size === 0}
              className="btn-ghost px-3 py-1.5 text-xs text-emerald-300 hover:bg-emerald-950/40 border border-emerald-500/20 rounded-lg flex items-center gap-1.5 disabled:opacity-40"
              title={t('localMods.batchEnableTip')}
            >
              <CheckCircle size={15} weight="bold" />
              <span>{t('localMods.batchEnable')}</span>
            </button>
            <button
              onClick={() => handleBatchToggle(false)}
              disabled={batchBusy || selectedPaths.size === 0}
              className="btn-ghost px-3 py-1.5 text-xs text-amber-300 hover:bg-amber-950/40 border border-amber-500/20 rounded-lg flex items-center gap-1.5 disabled:opacity-40"
              title={t('localMods.batchDisableTip')}
            >
              <Prohibit size={15} weight="bold" />
              <span>{t('localMods.batchDisable')}</span>
            </button>
            <button
              onClick={() => setConfirmBatchDelete(true)}
              disabled={batchBusy || selectedPaths.size === 0}
              className="btn-ghost px-3 py-1.5 text-xs text-red-300 hover:bg-red-950/40 border border-red-500/20 rounded-lg flex items-center gap-1.5 disabled:opacity-40"
              title={t('localMods.batchDeleteTip')}
            >
              <Trash size={15} weight="bold" />
              <span>{t('localMods.batchDelete')}</span>
            </button>
          </div>

          <div className="h-4 w-px bg-white/10" />

          <button
            onClick={() => {
              setSelectMode(false)
              deselectAll()
            }}
            className="text-xs text-gray-400 hover:text-white p-1"
            title={t('localMods.closeSelectMode')}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      )}

      {confirmBatchDelete && (
        <ConfirmDialog
          title={t('localMods.batchDeleteConfirmTitle', { count: selectedPaths.size })}
          message={t('localMods.batchDeleteConfirmMsg')}
          confirmLabel={<><Trash size={15} weight="bold" /> {t('localMods.batchDeleteConfirmBtn', { count: selectedPaths.size })}</>}
          onConfirm={handleBatchDelete}
          onCancel={() => setConfirmBatchDelete(false)}
        />
      )}

      {showConflicts && (
        <ConflictsModal
          onClose={() => setShowConflicts(false)}
          onFilesChanged={scan}
        />
      )}

      {showPolycount && (
        <PolycountModal
          onClose={() => setShowPolycount(false)}
          onOpen3D={(m) => openModDetail(m, true)}
          onFilesChanged={scan}
        />
      )}

      {showSaveInspector && (
        <SaveInspectorModal
          onClose={() => setShowSaveInspector(false)}
          onFilesChanged={scan}
        />
      )}
    </div>
  )
}
