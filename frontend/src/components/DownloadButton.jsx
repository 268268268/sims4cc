import { useEffect, useRef } from 'react'
import { Package, CircleNotch, Check, Warning, ArrowUp, ArrowsClockwise, DownloadSimple, Clock } from '@phosphor-icons/react'
import { formatBytes } from '../lib/format'
import { useT } from '../lib/i18n'
import { useDownloadQueue } from '../context/DownloadQueueContext'

const ICON = { size: 15, weight: 'bold' }

/**
 * Self-contained CurseForge download/update button backed by the global
 * parallel DownloadQueueContext so state & progress persist across tab switches.
 */
export default function DownloadButton({ mod, installed, onInstalled, mode = 'download', className = '' }) {
  const { t, lang } = useT()
  const { getCurseForgeJob, enqueueCurseForge } = useDownloadQueue()
  const job = getCurseForgeJob(mod.id)
  const notifiedRef = useRef(false)

  const status = job?.status || 'idle' // idle | queued | downloading | installing | completed | error | canceled
  const isBusy = status === 'queued' || status === 'downloading' || status === 'installing'

  useEffect(() => {
    if (status === 'completed' && !notifiedRef.current) {
      notifiedRef.current = true
      onInstalled?.(mod.id)
    } else if (status === 'queued' || status === 'downloading') {
      notifiedRef.current = false
    }
  }, [status, mod.id, onInstalled])

  const onClick = async (e) => {
    e?.stopPropagation()
    if (isBusy) return
    await enqueueCurseForge(mod, mode === 'update')
  }

  const pct = job?.total > 0
    ? Math.min(100, Math.round((job.received / job.total) * 100))
    : job?.percent > 0
      ? Math.min(100, Math.round(job.percent))
      : null
  const installing = status === 'installing' || job?.phase === 'installing'

  const label =
    status === 'queued'
      ? <><Clock {...ICON} /> {lang === 'ru' ? 'В очереди…' : 'Queued…'}</>
      : isBusy
        ? installing
          ? <><Package {...ICON} /> {t('curseforge.installing')}</>
          : pct != null && job?.received > 0
            ? <><CircleNotch {...ICON} className="animate-spin" /> {`${pct}% · ${formatBytes(job.received)}${job.total ? ` / ${formatBytes(job.total)}` : ''}`}</>
            : <><CircleNotch {...ICON} className="animate-spin" /> {t('curseforge.downloading')}</>
        : status === 'completed'
          ? <><Check {...ICON} /> {mode === 'update' ? t('curseforge.updated') : t('curseforge.downloaded')}</>
          : status === 'error'
            ? <><Warning {...ICON} /> {t('curseforge.failedRetry')}</>
            : mode === 'update'
              ? <><ArrowUp {...ICON} /> {t('curseforge.updateBtn')}</>
              : installed
                ? <><ArrowsClockwise {...ICON} /> {t('curseforge.redownload')}</>
                : <><DownloadSimple {...ICON} /> {t('curseforge.download')}</>

  const stateClass =
    isBusy
      ? 'btn-ghost cursor-wait'
      : status === 'completed'
        ? 'btn-success cursor-default'
        : status === 'error'
          ? 'btn-danger'
          : mode === 'update'
            ? 'btn-primary'
            : installed
              ? 'btn-ghost'
              : 'btn-primary'

  return (
    <button
      onClick={onClick}
      disabled={isBusy}
      className={`relative overflow-hidden ${stateClass} ${className}`}
    >
      {label}
      {status === 'downloading' && pct != null && !installing && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      )}
    </button>
  )
}
