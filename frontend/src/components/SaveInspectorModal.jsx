import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Warning, FloppyDisk, ArrowsClockwise, FolderSimple, CheckCircle, Trash, MagnifyingGlass, CaretLeft } from '@phosphor-icons/react'
import { formatBytes, formatDate } from '../lib/format'
import { useT } from '../lib/i18n'
import Plumbob from './Plumbob'
import Switch from './Switch'

export default function SaveInspectorModal({ onClose, onFilesChanged }) {
  const { t } = useT()
  const [loadingSaves, setLoadingSaves] = useState(true)
  const [saves, setSaves] = useState([])
  const [savesFolder, setSavesFolder] = useState(null)
  const [selectedSave, setSelectedSave] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisResult, setAnalysisResult] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('used') // 'used' | 'unused'
  const [query, setQuery] = useState('')
  const [busyPath, setBusyPath] = useState(null)

  const loadSaves = useCallback(async () => {
    setLoadingSaves(true)
    setError(null)
    try {
      const res = await window.api.listSaveFiles()
      if (!res.ok) {
        setError(res.error || t('saveInspector.loadError'))
      } else {
        setSaves(res.saves || [])
        setSavesFolder(res.savesFolder)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoadingSaves(false)
    }
  }, [t])

  useEffect(() => {
    loadSaves()
  }, [loadSaves])

  const runAnalysis = async (save) => {
    setSelectedSave(save)
    setAnalyzing(true)
    setError(null)
    try {
      const res = await window.api.analyzeSaveFile(save.filePath)
      if (!res.ok) {
        setError(res.error || t('saveInspector.analyzeError'))
      } else {
        setAnalysisResult(res)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setAnalyzing(false)
    }
  }

  const handleToggle = async (mod) => {
    if (busyPath) return
    setBusyPath(mod.filePath)
    try {
      const res = await window.api.toggleLocalModEnabled(mod.filePath, !mod.enabled)
      if (res.ok) {
        setAnalysisResult(prev => {
          if (!prev) return prev
          const updateList = (list) =>
            list.map(m => m.filePath === mod.filePath ? { ...m, enabled: !m.enabled, filePath: res.newPath || m.filePath } : m)
          return {
            ...prev,
            usedMods: updateList(prev.usedMods),
            unusedMods: updateList(prev.unusedMods)
          }
        })
        onFilesChanged?.()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyPath(null)
    }
  }

  const handleDelete = async (mod) => {
    if (busyPath) return
    setBusyPath(mod.filePath)
    try {
      const res = await window.api.deleteLocalMod(mod.filePath)
      if (res.ok) {
        setAnalysisResult(prev => {
          if (!prev) return prev
          return {
            ...prev,
            usedMods: prev.usedMods.filter(m => m.filePath !== mod.filePath),
            unusedMods: prev.unusedMods.filter(m => m.filePath !== mod.filePath),
            stats: {
              ...prev.stats,
              totalModsCount: Math.max(0, prev.stats.totalModsCount - 1),
              usedCount: prev.usedMods.some(m => m.filePath === mod.filePath) ? Math.max(0, prev.stats.usedCount - 1) : prev.stats.usedCount,
              unusedCount: prev.unusedMods.some(m => m.filePath === mod.filePath) ? Math.max(0, prev.stats.unusedCount - 1) : prev.stats.unusedCount
            }
          }
        })
        onFilesChanged?.()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setBusyPath(null)
    }
  }

  const currentList = useMemo(() => {
    if (!analysisResult) return []
    let list = activeTab === 'used' ? analysisResult.usedMods : analysisResult.unusedMods
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(m => m.fileName.toLowerCase().includes(q) || m.relativePath.toLowerCase().includes(q))
    }
    return list
  }, [analysisResult, activeTab, query])

  const stats = analysisResult?.stats

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b101a] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/20 text-sky-400">
              <FloppyDisk size={22} weight="bold" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">{t('saveInspector.title')}</h2>
              <p className="text-gray-400 text-xs">
                {analysisResult
                  ? t('saveInspector.inspectingSave', { file: selectedSave?.fileName, name: analysisResult.saveName })
                  : t('saveInspector.inspectingDesc')}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {analysisResult && (
              <button
                onClick={() => setAnalysisResult(null)}
                className="btn-ghost px-3 py-1.5 text-xs text-gray-300 hover:text-white flex items-center gap-1.5"
              >
                <CaretLeft size={14} weight="bold" />
                <span>{t('saveInspector.allSaves')}</span>
              </button>
            )}
            <button
              onClick={loadSaves}
              disabled={loadingSaves || analyzing}
              className="btn-ghost px-3 py-1.5 text-xs text-gray-300 hover:text-white flex items-center gap-1.5"
            >
              <ArrowsClockwise size={14} weight="bold" className={loadingSaves ? 'animate-spin' : ''} />
              <span>{t('saveInspector.refresh')}</span>
            </button>
            <button
              onClick={onClose}
              className="btn-ghost p-1.5 text-gray-400 hover:text-white"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Toolbar when viewing analysis */}
        {analysisResult && !analyzing && (
          <div className="px-6 py-3 border-b border-white/5 bg-black/20 flex items-center justify-between flex-wrap gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('used')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  activeTab === 'used'
                    ? 'bg-emerald-600/30 text-emerald-200 border border-emerald-500/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <CheckCircle size={15} weight="bold" />
                <span>{t('saveInspector.usedCount', { count: stats?.usedCount || 0 })}</span>
                <span className="badge bg-emerald-950/80 text-emerald-300 font-mono text-[10px]">
                  {formatBytes(stats?.usedSizeBytes || 0)}
                </span>
              </button>

              <button
                onClick={() => setActiveTab('unused')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  activeTab === 'unused'
                    ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Warning size={15} weight="bold" />
                <span>{t('saveInspector.unusedCount', { count: stats?.unusedCount || 0 })}</span>
                <span className="badge bg-amber-950/80 text-amber-300 font-mono text-[10px]">
                  {formatBytes(stats?.unusedSizeBytes || 0)}
                </span>
              </button>
            </div>

            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t('saveInspector.searchMod')}
                className="input w-52 pl-8 pr-3 py-1.5 text-xs"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="banner-error mb-4 flex items-center gap-2">
              <Warning size={16} weight="fill" /> {error}
            </div>
          )}

          {/* Loading States */}
          {(loadingSaves || analyzing) && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Plumbob size={48} spin />
              <p className="text-sm text-gray-400 font-medium">
                {analyzing ? t('saveInspector.readingSave') : t('saveInspector.searchingSaves')}
              </p>
            </div>
          )}

          {/* List of Save Files (Selection) */}
          {!analysisResult && !loadingSaves && !analyzing && (
            <div>
              <div className="mb-4 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-white">{t('saveInspector.selectPrompt')}</h3>
                  {savesFolder && (
                    <p className="text-xs text-gray-500 truncate mt-0.5">{savesFolder}</p>
                  )}
                </div>
                <span className="text-xs text-gray-500">{t('saveInspector.foundSaves', { count: saves.length })}</span>
              </div>

              {saves.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 gap-2">
                  <FloppyDisk size={48} weight="thin" className="text-gray-600" />
                  <p className="text-sm font-semibold text-gray-300">{t('saveInspector.noSavesFound')}</p>
                  <p className="text-xs max-w-sm">{t('saveInspector.noSavesHint')}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {saves.map(save => (
                    <div
                      key={save.fileName}
                      className="group bg-white/[0.02] border border-white/5 hover:border-emerald-500/40 rounded-xl overflow-hidden flex flex-col transition-all cursor-pointer shadow-lg hover:shadow-emerald-950/20"
                      onClick={() => runAnalysis(save)}
                    >
                      {/* Save Thumbnail */}
                      <div className="w-full h-36 bg-black/50 relative flex items-center justify-center overflow-hidden border-b border-white/5">
                        {save.thumbnailUrl ? (
                          <img
                            src={save.thumbnailUrl}
                            alt={save.fileName}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="flex flex-col items-center gap-1.5 text-gray-600">
                            <FloppyDisk size={36} weight="thin" />
                            <span className="text-[10px] font-mono">{t('saveInspector.noPreview')}</span>
                          </div>
                        )}
                        <span className="absolute top-2 right-2 badge bg-black/70 backdrop-blur-md text-gray-300 font-mono text-[10px]">
                          {formatBytes(save.size)}
                        </span>
                      </div>

                      {/* Info */}
                      <div className="p-3.5 flex flex-col gap-2 flex-1">
                        <div>
                          <p className="text-sm font-semibold text-white group-hover:text-emerald-400 transition-colors">
                            {save.fileName}
                          </p>
                          <p className="text-[11px] text-gray-500">
                            {t('saveInspector.modified', { date: formatDate(save.modifiedAt) })}
                          </p>
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            runAnalysis(save)
                          }}
                          className="btn-primary mt-auto py-1.5 text-xs w-full flex items-center justify-center gap-1.5 bg-gradient-to-r from-emerald-600 to-teal-600"
                        >
                          <FloppyDisk size={14} weight="bold" />
                          <span>{t('saveInspector.analyzeSaveBtn')}</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Analysis Result (Used vs Unused) */}
          {analysisResult && !analyzing && (
            <div>
              {currentList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 gap-2">
                  <CheckCircle size={48} weight="thin" className="text-emerald-400/60" />
                  <p className="text-sm font-semibold text-gray-300">{t('saveInspector.emptyList')}</p>
                  <p className="text-xs max-w-sm">
                    {activeTab === 'used'
                      ? t('saveInspector.emptyUsed')
                      : t('saveInspector.emptyUnused')}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {currentList.map(mod => {
                    const isPending = busyPath === mod.filePath
                    const isUsed = activeTab === 'used'

                    return (
                      <div
                        key={mod.filePath}
                        className={`flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.02] border transition-all ${
                          isUsed
                            ? 'border-emerald-500/20 hover:border-emerald-500/40'
                            : 'border-white/5 hover:border-amber-500/30'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-white truncate" title={mod.fileName}>
                              {mod.fileName}
                            </span>
                            <span className={`badge text-[10px] ${isUsed ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gray-800 text-gray-400'}`}>
                              {isUsed ? t('saveInspector.wornOrPlaced') : t('saveInspector.notInSave')}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                            <span className="truncate max-w-sm" title={mod.relativePath}>{mod.relativePath}</span>
                            <span>·</span>
                            <span>{formatBytes(mod.size)}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => window.api.showItemInFolder(mod.filePath)}
                            className="btn-ghost p-1.5 text-gray-400 hover:text-white"
                            title={t('polycount.showInFolder')}
                          >
                            <FolderSimple size={15} />
                          </button>

                          <div className="flex items-center gap-1 pl-1">
                            <Switch
                              on={mod.enabled}
                              pending={isPending}
                              onClick={() => handleToggle(mod)}
                              title={mod.enabled ? t('polycount.disableTip') : t('polycount.enableTip')}
                            />
                          </div>

                          <button
                            onClick={() => handleDelete(mod)}
                            disabled={isPending}
                            className="btn-ghost p-1.5 text-red-400 hover:text-red-200"
                            title={t('polycount.deleteToTrash')}
                          >
                            <Trash size={15} />
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
