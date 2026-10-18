import { useState, useEffect, useCallback } from 'react'
import { X, Warning, Trash, ArrowsClockwise, Copy, ShieldWarning, CheckCircle, FolderSimple, FileCode } from '@phosphor-icons/react'
import { formatBytes } from '../lib/format'
import Plumbob from './Plumbob'

export default function ConflictsModal({ onClose, onFilesChanged }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [activeTab, setActiveTab] = useState('duplicates') // 'duplicates' | 'conflicts'
  const [deletingPath, setDeletingPath] = useState(null)

  const scan = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await window.api.scanConflicts()
      if (!res.ok) {
        setError(res.error || 'Ошибка сканирования конфликтов')
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

  const handleDeleteDuplicate = async (filePath) => {
    setDeletingPath(filePath)
    try {
      const res = await window.api.deleteDuplicateMod(filePath)
      if (res.ok) {
        // Удаляем файл из состояния
        setData(prev => {
          if (!prev) return prev
          const nextDupes = prev.duplicates.map(group => ({
            ...group,
            files: group.files.filter(f => f.filePath !== filePath)
          })).filter(group => group.files.length > 1)

          return {
            ...prev,
            duplicates: nextDupes,
            stats: {
              ...prev.stats,
              duplicateFilesCount: Math.max(0, prev.stats.duplicateFilesCount - 1)
            }
          }
        })
        onFilesChanged?.()
      }
    } catch (err) {
      setError(err.message)
    } finally {
      setDeletingPath(null)
    }
  }

  const duplicates = data?.duplicates || []
  const conflicts = data?.conflicts || []
  const stats = data?.stats

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#0b101a] border border-white/10 rounded-2xl w-full max-w-4xl max-h-[88vh] flex flex-col shadow-2xl overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between shrink-0 bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <ShieldWarning size={22} weight="bold" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg leading-tight">Дубликаты и Конфликты</h2>
              <p className="text-gray-400 text-xs">Поиск 100% копий по SHA-1 и переопределений TGI-ресурсов</p>
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

        {/* Tabs & Stats */}
        {data && !loading && (
          <div className="px-6 py-3 border-b border-white/5 bg-black/20 flex items-center justify-between flex-wrap gap-3 shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('duplicates')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  activeTab === 'duplicates'
                    ? 'bg-amber-600/30 text-amber-200 border border-amber-500/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Copy size={15} weight="bold" />
                <span>Дубликаты файлов ({stats?.duplicateFilesCount || 0})</span>
                {stats?.totalWastedBytes > 0 && (
                  <span className="badge bg-amber-950/80 text-amber-300 font-mono text-[10px]">
                    -{formatBytes(stats.totalWastedBytes)}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('conflicts')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2 transition-all ${
                  activeTab === 'conflicts'
                    ? 'bg-red-600/30 text-red-200 border border-red-500/40'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                }`}
              >
                <Warning size={15} weight="bold" />
                <span>TGI Конфликты ({stats?.tgiConflictsCount || 0})</span>
              </button>
            </div>

            <div className="text-xs text-gray-500">
              Просканировано: <span className="text-gray-300 font-mono">{stats?.totalFilesScanned || 0}</span> файлов
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Plumbob size={48} spin />
              <p className="text-sm text-gray-400 font-medium">Сканирование DBPF заголовков и хешей файлов...</p>
            </div>
          )}

          {error && !loading && (
            <div className="banner-error mb-4 flex items-center gap-2">
              <Warning size={16} weight="fill" /> {error}
            </div>
          )}

          {!loading && !error && (
            <>
              {activeTab === 'duplicates' && (
                <div>
                  {duplicates.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 gap-2">
                      <CheckCircle size={48} weight="thin" className="text-emerald-400/60" />
                      <p className="text-sm font-semibold text-gray-300">Дубликаты не найдены</p>
                      <p className="text-xs max-w-sm">Все файлы в вашей папке Mods имеют уникальный SHA-1 хеш.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {duplicates.map((group, idx) => (
                        <div key={group.hash || idx} className="bg-white/[0.02] border border-white/5 rounded-xl p-4">
                          <div className="flex items-center justify-between pb-3 mb-3 border-b border-white/5">
                            <div className="flex items-center gap-2">
                              <span className="badge bg-amber-500/20 text-amber-300 font-mono text-xs">
                                Копий: {group.files.length}
                              </span>
                              <span className="text-xs text-gray-400">
                                Размер файла: <strong className="text-gray-200">{formatBytes(group.size)}</strong>
                              </span>
                              <span className="text-xs text-amber-400/80 font-mono">
                                (Лишнее место: {formatBytes(group.wastedBytes)})
                              </span>
                            </div>
                            <span className="text-[10px] font-mono text-gray-600 truncate max-w-[200px]" title={group.hash}>
                              sha1:{group.hash.slice(0, 12)}…
                            </span>
                          </div>

                          <div className="space-y-2">
                            {group.files.map((file, fIdx) => (
                              <div
                                key={file.filePath}
                                className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-black/40 border border-white/5 hover:border-white/10 transition-colors"
                              >
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-white truncate" title={file.fileName}>
                                      {file.fileName}
                                    </span>
                                    {fIdx === 0 && (
                                      <span className="badge bg-emerald-500/20 text-emerald-300 text-[10px]">
                                        Основной файл
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-[11px] text-gray-500 truncate mt-0.5" title={file.relativePath}>
                                    {file.relativePath}
                                  </p>
                                </div>

                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    onClick={() => window.api.showItemInFolder(file.filePath)}
                                    className="btn-ghost p-1.5 text-gray-400 hover:text-white"
                                    title="Показать в проводнике"
                                  >
                                    <FolderSimple size={15} />
                                  </button>
                                  {fIdx > 0 && (
                                    <button
                                      onClick={() => handleDeleteDuplicate(file.filePath)}
                                      disabled={deletingPath === file.filePath}
                                      className="btn-ghost px-2.5 py-1 text-xs text-red-300 hover:bg-red-950/40 border border-red-500/20 rounded-md flex items-center gap-1"
                                      title="Удалить копию в корзину"
                                    >
                                      <Trash size={13} />
                                      <span>{deletingPath === file.filePath ? '…' : 'Удалить копию'}</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'conflicts' && (
                <div>
                  {conflicts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center text-gray-500 gap-2">
                      <CheckCircle size={48} weight="thin" className="text-emerald-400/60" />
                      <p className="text-sm font-semibold text-gray-300">TGI конфликтов не обнаружено</p>
                      <p className="text-xs max-w-sm">Никакие два мода не перезаписывают одинаковые CAS, Object или Tuning ресурсы.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {conflicts.map(conf => (
                        <div key={conf.id} className="bg-red-950/10 border border-red-500/20 rounded-xl p-4">
                          <div className="flex items-center justify-between pb-3 mb-3 border-b border-red-500/10">
                            <div className="flex items-center gap-2">
                              <span className="badge bg-red-600/30 text-red-200 text-xs font-semibold">
                                Конфликт переопределения ({conf.resources.length} рес.)
                              </span>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-white truncate" title={conf.fileA.fileName}>
                                  {conf.fileA.fileName}
                                </span>
                                <button
                                  onClick={() => window.api.showItemInFolder(conf.fileA.filePath)}
                                  className="btn-ghost p-1 text-gray-400 hover:text-white"
                                  title="В папке"
                                >
                                  <FolderSimple size={13} />
                                </button>
                              </div>
                              <p className="text-[11px] text-gray-500 truncate mt-0.5">{conf.fileA.relativePath}</p>
                            </div>

                            <div className="p-3 rounded-lg bg-black/40 border border-white/5">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-semibold text-white truncate" title={conf.fileB.fileName}>
                                  {conf.fileB.fileName}
                                </span>
                                <button
                                  onClick={() => window.api.showItemInFolder(conf.fileB.filePath)}
                                  className="btn-ghost p-1 text-gray-400 hover:text-white"
                                  title="В папке"
                                >
                                  <FolderSimple size={13} />
                                </button>
                              </div>
                              <p className="text-[11px] text-gray-500 truncate mt-0.5">{conf.fileB.relativePath}</p>
                            </div>
                          </div>

                          <div className="bg-black/30 rounded-lg p-2.5">
                            <span className="text-[11px] text-gray-400 font-semibold mb-1.5 block">
                              Конфликтующие ключи:
                            </span>
                            <div className="flex flex-wrap gap-1.5">
                              {conf.resources.slice(0, 10).map((r, rIdx) => (
                                <span
                                  key={rIdx}
                                  className="badge bg-white/5 border border-white/10 text-gray-300 font-mono text-[10px]"
                                  title={r.key}
                                >
                                  {r.typeName} ({r.typeHex})
                                </span>
                              ))}
                              {conf.resources.length > 10 && (
                                <span className="badge bg-white/5 text-gray-500 text-[10px]">
                                  +{conf.resources.length - 10} ещё
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
