import { useState } from 'react'

/**
 * Self-contained CurseForge download button + state machine.
 * Shared by the grid card and the detail modal so both stay in sync via the
 * lifted `installed` flag and the `onInstalled` callback.
 */
export default function DownloadButton({ mod, installed, onInstalled, className = '' }) {
  const [dlState, setDlState] = useState('idle') // idle | downloading | done | error

  const onDownload = async (e) => {
    e?.stopPropagation()
    if (dlState === 'downloading') return
    setDlState('downloading')
    try {
      const res = await window.api.downloadCurseForgeMod(mod)
      if (res?.ok) {
        setDlState('done')
        onInstalled?.(mod.id)
      } else {
        console.error('[CurseForge] Download failed:', res?.error)
        setDlState('error')
      }
    } catch (err) {
      console.error('[CurseForge] Download threw:', err)
      setDlState('error')
    }
  }

  const label =
    dlState === 'downloading' ? '⏳ Downloading…'
      : dlState === 'done' ? '✓ Downloaded!'
        : dlState === 'error' ? '⚠ Failed — retry'
          : installed ? '↻ Re-download'
            : '⬇ Download'

  const stateClass =
    dlState === 'downloading' ? 'btn-ghost cursor-wait'
      : dlState === 'done' ? 'btn-success cursor-default'
        : dlState === 'error' ? 'btn-danger'
          : installed ? 'btn-ghost'
            : 'btn-primary'

  return (
    <button
      onClick={onDownload}
      disabled={dlState === 'downloading'}
      className={`${stateClass} ${className}`}
    >
      {label}
    </button>
  )
}
