import { useEffect, useRef } from 'react'
import { DownloadSimple, CircleNotch, Check, Warning, X, ArrowsClockwise, Trash, CaretDown, CaretUp, FolderOpen, Clock } from '@phosphor-icons/react'
import { useDownloadQueue } from '../context/DownloadQueueContext'
import { formatBytes } from '../lib/format'
import SourceIcon from './SourceIcon'
import { useT } from '../lib/i18n'

export default function DownloadQueueDrawer() {
  const { lang } = useT()
  const isRu = lang === 'ru'
  const {
    queue,
    activeCount,
    drawerOpen,
    setDrawerOpen,
    cancelJob,
    retryJob,
    clearCompleted
  } = useDownloadQueue()

  const prevCountRef = useRef(0)

  // Автоматически разворачиваем панель при добавлении первой загрузки
  useEffect(() => {
    if (queue.length > prevCountRef.current && prevCountRef.current === 0) {
      setDrawerOpen(true)
    }
    prevCountRef.current = queue.length
  }, [queue.length, setDrawerOpen])

  if (queue.length === 0) return null

  const completedCount = queue.filter(j => j.status === 'completed').length
  const errorCount = queue.filter(j => j.status === 'error' || j.status === 'canceled').length
  const hasFinished = completedCount > 0 || errorCount > 0

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end pointer-events-none">
      {drawerOpen ? (
        <div className="pointer-events-auto w-96 max-h-[28rem] flex flex-col rounded-xl bg-[#0c120f]/95 backdrop-blur-md border border-emerald-500/25 shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-2.5 bg-emerald-950/40 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {activeCount > 0 ? (
                <CircleNotch size={16} weight="bold" className="text-emerald-400 animate-spin" />
              ) : (
                <DownloadSimple size={16} weight="bold" className="text-emerald-400" />
              )}
              <span className="text-xs font-semibold text-white">
                {isRu ? 'Менеджер загрузок' : 'Download Manager'}
              </span>
              <span className="badge bg-emerald-500/20 text-emerald-300 text-[11px]">
                {activeCount > 0
                  ? (isRu ? `${activeCount} актив.` : `${activeCount} active`)
                  : `${completedCount}/${queue.length}`}
              </span>
            </div>
            <div className="flex items-center gap-1">
              {hasFinished && (
                <button
                  onClick={clearCompleted}
                  title={isRu ? 'Очистить завершенные' : 'Clear finished'}
                  className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                >
                  <Trash size={14} weight="bold" />
                </button>
              )}
              <button
                onClick={() => setDrawerOpen(false)}
                title={isRu ? 'Свернуть' : 'Minimize'}
                className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
              >
                <CaretDown size={14} weight="bold" />
              </button>
            </div>
          </div>

          {/* Queue list */}
          <div className="flex-1 overflow-y-auto divide-y divide-white/5 max-h-80">
            {queue.map(job => {
              const pct = Math.max(0, Math.min(100, Math.round(job.percent || 0)))
              const isRunning = job.status === 'downloading' || job.status === 'installing'
              const isQueued = job.status === 'queued'
              const isDone = job.status === 'completed'
              const isErr = job.status === 'error' || job.status === 'canceled'
              const firstPath = job.installedPaths?.[0]

              return (
                <div key={job.id} className="px-3.5 py-2.5 flex flex-col gap-1.5 hover:bg-white/[0.02]">
                  <div className="flex items-center gap-2.5">
                    {job.imageUrl ? (
                      <img
                        src={job.imageUrl}
                        alt=""
                        className="w-8 h-8 rounded object-cover bg-[#141a17] shrink-0"
                        onError={e => { e.currentTarget.style.display = 'none' }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded bg-white/5 flex items-center justify-center shrink-0 text-emerald-400">
                        <SourceIcon type={job.sourceType || job.kind} size={15} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <SourceIcon type={job.sourceType || job.kind} size={12} className="text-gray-400 shrink-0" />
                        <p className="text-xs font-medium text-white truncate" title={job.title}>
                          {job.title}
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-gray-400">
                        {isQueued && (
                          <span className="text-amber-300 inline-flex items-center gap-1">
                            <Clock size={11} weight="bold" />
                            {isRu ? 'В очереди…' : 'Queued…'}
                          </span>
                        )}
                        {isRunning && (
                          <span className="text-emerald-300">
                            {job.status === 'installing'
                              ? (isRu ? 'Распаковка и установка…' : 'Installing…')
                              : `${pct}%${job.received > 0 ? ` · ${formatBytes(job.received)}${job.total > 0 ? ` / ${formatBytes(job.total)}` : ''}` : ''}`}
                          </span>
                        )}
                        {isDone && (
                          <span className="text-emerald-400 inline-flex items-center gap-1">
                            <Check size={11} weight="bold" />
                            {isRu ? 'Установлено' : 'Installed'}
                          </span>
                        )}
                        {isErr && (
                          <span className="text-red-400 truncate" title={job.error}>
                            <Warning size={11} weight="bold" className="inline mr-1" />
                            {job.error || (isRu ? 'Ошибка загрузки' : 'Download failed')}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {isDone && firstPath && (
                        <button
                          onClick={() => window.api?.showItemInFolder?.(firstPath)}
                          title={isRu ? 'Показать в папке' : 'Show in folder'}
                          className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-emerald-300"
                        >
                          <FolderOpen size={14} weight="bold" />
                        </button>
                      )}
                      {isErr && (
                        <button
                          onClick={() => retryJob(job.id)}
                          title={isRu ? 'Повторить' : 'Retry'}
                          className="p-1 rounded hover:bg-white/10 text-amber-300 hover:text-amber-200"
                        >
                          <ArrowsClockwise size={14} weight="bold" />
                        </button>
                      )}
                      {(isRunning || isQueued) && (
                        <button
                          onClick={() => cancelJob(job.id)}
                          title={isRu ? 'Отменить' : 'Cancel'}
                          className="p-1 rounded hover:bg-white/10 text-gray-500 hover:text-red-400"
                        >
                          <X size={13} weight="bold" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  {(isRunning || isQueued) && (
                    <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          job.status === 'installing'
                            ? 'bg-emerald-300 animate-pulse w-full'
                            : isQueued
                              ? 'bg-amber-400/50 w-1/6 animate-pulse'
                              : 'bg-emerald-400'
                        }`}
                        style={job.status === 'downloading' ? { width: `${Math.max(4, pct)}%` } : undefined}
                      />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <button
          onClick={() => setDrawerOpen(true)}
          className="pointer-events-auto flex items-center gap-2.5 px-4 py-2.5 rounded-full bg-[#0c120f]/95 backdrop-blur-md border border-emerald-500/30 shadow-xl hover:border-emerald-400/60 transition-all text-xs font-medium text-white"
        >
          {activeCount > 0 ? (
            <CircleNotch size={16} weight="bold" className="text-emerald-400 animate-spin" />
          ) : (
            <DownloadSimple size={16} weight="bold" className="text-emerald-400" />
          )}
          <span>
            {activeCount > 0
              ? (isRu ? `Загрузки (${activeCount} актив.)` : `Downloads (${activeCount} active)`)
              : (isRu ? `Загрузки (${completedCount}/${queue.length})` : `Downloads (${completedCount}/${queue.length})`)}
          </span>
          <CaretUp size={13} weight="bold" className="text-gray-400" />
        </button>
      )}
    </div>
  )
}
