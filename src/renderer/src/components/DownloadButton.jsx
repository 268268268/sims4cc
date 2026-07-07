import { useState, useEffect } from 'react'
import { formatBytes } from '../lib/format'
import { markChanged } from '../lib/sessionActivity'

/**
 * Self-contained CurseForge download/update button + state machine with a live
 * progress bar. Shared by the grid card, the Installed view and the detail
 * modal so all stay in sync via the lifted `installed` flag / `onInstalled`.
 *
 * mode: 'download' (default) | 'update' — update replaces the old install.
 */
export default function DownloadButton({ mod, installed, onInstalled, mode = 'download', className = '' }) {
  const [dlState, setDlState] = useState('idle') // idle | downloading | done | error
  const [progress, setProgress] = useState(null) // { received, total, phase }

  // subscribe to progress only while this mod is actively downloading
  useEffect(() => {
    if (dlState !== 'downloading') return
    const off = window.api.onCurseForgeProgress?.((p) => {
      if (p.modId === mod.id) setProgress(p)
    })
    return () => off?.()
  }, [dlState, mod.id])

  const onClick = async (e) => {
    e?.stopPropagation()
    if (dlState === 'downloading') return
    setDlState('downloading')
    setProgress(null)
    try {
      const res = mode === 'update'
        ? await window.api.updateCurseForgeMod(mod)
        : await window.api.downloadCurseForgeMod(mod)
      if (res?.ok) {
        setDlState('done')
        markChanged()
        onInstalled?.(mod.id)
      } else {
        console.error(`[CurseForge] ${mode} failed:`, res?.error)
        setDlState('error')
      }
    } catch (err) {
      console.error(`[CurseForge] ${mode} threw:`, err)
      setDlState('error')
    }
  }

  const pct = progress?.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null
  const installing = progress?.phase === 'installing'

  const label =
    dlState === 'downloading'
      ? installing
        ? '📦 Installing…'
        : pct != null
          ? `⏳ ${pct}% · ${formatBytes(progress.received)}${progress.total ? ` / ${formatBytes(progress.total)}` : ''}`
          : '⏳ Downloading…'
      : dlState === 'done'
        ? mode === 'update' ? '✓ Updated!' : '✓ Downloaded!'
        : dlState === 'error'
          ? '⚠ Failed — retry'
          : mode === 'update'
            ? '⬆ Update'
            : installed
              ? '↻ Re-download'
              : '⬇ Download'

  const stateClass =
    dlState === 'downloading'
      ? 'btn-ghost cursor-wait'
      : dlState === 'done'
        ? 'btn-success cursor-default'
        : dlState === 'error'
          ? 'btn-danger'
          : mode === 'update'
            ? 'btn-primary'
            : installed
              ? 'btn-ghost'
              : 'btn-primary'

  return (
    <button
      onClick={onClick}
      disabled={dlState === 'downloading'}
      className={`relative overflow-hidden ${stateClass} ${className}`}
    >
      {label}
      {dlState === 'downloading' && pct != null && !installing && (
        <span
          className="absolute inset-x-0 bottom-0 h-0.5 bg-violet-400 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      )}
    </button>
  )
}
