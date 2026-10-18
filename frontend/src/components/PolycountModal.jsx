import { useState, useEffect, useCallback, useMemo } from 'react'
import { X, Warning, Cube, Trash, ArrowsClockwise, FolderSimple, MagnifyingGlass, CheckCircle } from '@phosphor-icons/react'
import { formatBytes } from '../lib/format'
import Plumbob from './Plumbob'
import Switch from './Switch'

export default function PolycountModal({ onClose, onOpen3D, onFilesChanged }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [filter, setFilter] = useState('all') // 'all' | 'critical' | 'heavy' | 'medium' | 'low'
  const [query, setQuery] = useState('')
  const [busyPath, setBusyPath] = useState(null)

  const scan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.scanPolycount()
      if (!res.ok) {
        setError(res.error || 'Ошибка сканирования полигональности')
      } else {
        setData(res)
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    scan()
  }, [scan])

  const handleToggle = async (mod) => {
    if (busyPath) return
    setBusyPath(mod.filePath)
    try {
      const res = await window.api.toggleLocalModEnabled(mod.filePath, !mod.enabled)
      if (res.ok) {
        setData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            mods: prev.mods.map(m => m.filePath === mod.filePath ? { ...m, enabled: !m.enabled, filePath: res.newPath || m.filePath } : m)
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
        setData(prev => {
          if (!prev) return prev
          return {
            ...prev,
            mods: prev.mods.filter(m => m.filePath !== mod.filePath)
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

  const visibleMods = useMemo(() => {
    let list = data?.mods || []
    if (filter !== 'all') {
      list = list.filter(m => m.severity === filter)
    }
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter(m => m.fileName.toLowerCase().includes(q) || m.relativePath.toLowerCase().includes(q))
    }
    return list
  }, [data, filter, query])

  const summary = data?.summary

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b101a] border border-white/10 rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-400">
              <Cube size={22} weight="bold" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Детектор тяжелых модов (Polycount Checker)</h2>
              <p className="text-gray-400 text-xs">Подсчет полигонов в моделях для поиска CC, просаживающего FPS в игре</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={scan}
              disabled={loading}
              className="btn-ghost px-3 py-1.5 text-xs text-gray-300 hover:text-white flex items-center gap-1.5"
            >
              <ArrowsClockwise size={14} weight="bold" className={loading ? 'animate-spin' : ''} />
              <span>Пересканировать</span>
            </button>
            <button
              onClick={onClose}
              className="btn-ghost p-1.5 text-gray-400 hover:text-white"
            >
              <X size={18} weight="bold" />
            </button>
          </div>
        </div>

        {/* Toolbar & Filter Chips */}
        {data && !loading && (
          <div className="px-6 py-3 border-b border-white/5 bg-black/20 flex items-center justify-between flex-wrap gap-3 shrink-0">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                onClick={() => setFilter('all')}
                className={`chip ${filter === 'all' ? 'chip-active' : ''}`}
              >
                Все 3D ({summary?.totalScannedWithGeom || 0})
              </button>
              <button
                onClick={() => setFilter('critical')}
                className={`chip ${filter === 'critical' ? 'bg-red-600/30 text-red-200 border-red-500/40' : ''}`}
              >
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block mr-1" />
                Критические &gt;50k ({summary?.criticalCount || 0})
              </button>
              <button
                onClick={() => setFilter('heavy')}
                className={`chip ${filter === 'heavy' ? 'bg-amber-600/30 text-amber-200 border-amber-500/40' : ''}`}
              >
                <span className="w-2 h-2 rounded-full bg-amber-500 inline-block mr-1" />
                Тяжелые 25k–50k ({summary?.heavyCount || 0})
              </button>
              <button
                onClick={() => setFilter('medium')}
                className={`chip ${filter === 'medium' ? 'bg-yellow-600/30 text-yellow-200 border-yellow-500/40' : ''}`}
              >
                <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block mr-1" />
                Средние 10k–25k ({summary?.mediumCount || 0})
              </button>
              <button
                onClick={() => setFilter('low')}
                className={`chip ${filter === 'low' ? 'bg-emerald-600/30 text-emerald-200 border-emerald-500/40' : ''}`}
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block mr-1" />
                Легкие &lt;10k ({summary?.lowCount || 0})
              </button>
            </div>

            <div className="relative">
              <MagnifyingGlass size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
              <input
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Поиск по названию..."
                className="input w-52 pl-8 pr-3 py-1.5 text-xs"
              />
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Plumbob size={48} spin />
              <p className="text-sm text-gray-400 font-medium">Анализ 3D-геометрии GEOM ресурсов...</p>
            </div>
          )}

          {error && !loading && (
            <div className="banner-error mb-4 flex items-center gap-2">
              <Warning size={16} weight="fill" /> {error}
            </div>
          )}

          {!loading && !error && (
            <div>
              {visibleMods.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 gap-2">
                  <CheckCircle size={48} weight="thin" className="text-emerald-400/60" />
                  <p className="text-sm font-semibold text-gray-300">Моды не найдены</p>
                  <p className="text-xs max-w-sm">В выбранной категории нет 3D-моделей.</p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  {visibleMods.map((mod) => {
                    const isCrit = mod.severity === 'critical'
                    const isHeavy = mod.severity === 'heavy'
                    const isMed = mod.severity === 'medium'
                    const isPending = busyPath === mod.filePath

                    return (
                      <div
                        key={mod.filePath}
                        className={`flex items-center justify-between gap-4 p-3 rounded-xl bg-white/[0.02] border transition-all ${
                          isCrit
                            ? 'border-red-500/30 hover:border-red-500/50 bg-red-950/[0.08]'
                            : isHeavy
                            ? 'border-amber-500/20 hover:border-amber-500/40 bg-amber-950/[0.05]'
                            : 'border-white/5 hover:border-white/10'
                        }`}
                      >
                        {/* Name and path */}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2.5">
                            <span className="text-xs font-semibold text-white truncate" title={mod.fileName}>
                              {mod.fileName}
                            </span>
                            <span
                              className={`badge text-[10px] font-mono font-bold shrink-0 ${
                                isCrit
                                  ? 'bg-red-500/20 text-red-300 border border-red-500/30'
                                  : isHeavy
                                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                  : isMed
                                  ? 'bg-yellow-500/20 text-yellow-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {mod.polygons.toLocaleString()} полигонов
                            </span>
                          </div>
                          <div className="flex items-center gap-2 mt-1 text-[11px] text-gray-500">
                            <span className="truncate max-w-sm" title={mod.relativePath}>{mod.relativePath}</span>
                            <span>·</span>
                            <span>{mod.vertices.toLocaleString()} вершин</span>
                            <span>·</span>
                            <span>{formatBytes(mod.size)}</span>
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => {
                              onOpen3D?.({
                                name: mod.fileName,
                                filePath: mod.filePath,
                                type: 'package',
                                kinds: ['CAS']
                              })
                              onClose?.()
                            }}
                            className="btn-ghost px-2.5 py-1 text-xs text-emerald-300 hover:bg-emerald-950/40 border border-emerald-500/20 rounded-lg flex items-center gap-1"
                            title="Открыть в 3D"
                          >
                            <Cube size={14} weight="bold" />
                            <span>3D</span>
                          </button>

                          <button
                            onClick={() => window.api.showItemInFolder(mod.filePath)}
                            className="btn-ghost p-1.5 text-gray-400 hover:text-white"
                            title="Показать в папке"
                          >
                            <FolderSimple size={15} />
                          </button>

                          <div className="flex items-center gap-1 pl-1">
                            <Switch
                              on={mod.enabled}
                              pending={isPending}
                              onClick={() => handleToggle(mod)}
                              title={mod.enabled ? 'Отключить' : 'Включить'}
                            />
                          </div>

                          <button
                            onClick={() => handleDelete(mod)}
                            disabled={isPending}
                            className="btn-ghost p-1.5 text-red-400 hover:text-red-200"
                            title="Удалить в корзину"
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
