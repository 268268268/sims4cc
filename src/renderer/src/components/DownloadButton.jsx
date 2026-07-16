import { useState, useEffect } from 'react'
import { Package, CircleNotch, Check, Warning, ArrowUp, ArrowsClockwise, DownloadSimple, ArrowSquareOut } from '@phosphor-icons/react'
import { formatBytes } from '../lib/format'
import { markChanged } from '../lib/sessionActivity'
import { useT } from '../lib/i18n'

const ICON = { size: 15, weight: 'bold' }

/**
 * Self-contained CurseForge download/update button + state machine with a live
 * progress bar. Shared by the grid card, the Installed view and the detail
 * modal so all stay in sync via the lifted `installed` flag / `onInstalled`.
 *
 * mode: 'download' (default) | 'update' — update replaces the old install.
 */
export default function DownloadButton({ mod, installed, onInstalled, mode = 'download', className = '' }) {
  const { t } = useT()
  const [dlState, setDlState] = useState('idle') // idle | downloading | done | error
  const [progress, setProgress] = useState(null) // { received, total, phase }
  const [apiBlocked, setApiBlocked] = useState(false) // a download 403'd at runtime

  const websiteUrl = mod.links?.websiteUrl
  // CurseForge lets authors forbid third-party/API downloads; for those the API
  // 403s the download-url and retrying never helps (~70% of Sims 4 mods). Send
  // the user to the mod's own page instead of a dead "Failed — retry".
  const distributionBlocked = (mod.allowModDistribution === false || apiBlocked) && !!websiteUrl

  // subscribe to progress only while this mod is actively downloading
  useEffect(() => {
    if (dlState !== 'downloading') return
    const off = window.api.onCurseForgeProgress?.((p) => {
      if (p.modId === mod.id) setProgress(p)
    })
    return () => off?.()
  }, [dlState, mod.id])

  const openSite = (e) => {
    e?.stopPropagation()
    if (!websiteUrl) return
    // Watch Downloads so we can offer to install what the user grabs. Pass the mod
    // along so the install is recorded as THIS CurseForge mod (Installed badge).
    window.api.startDownloadWatch?.({ id: mod.id, name: mod.name, latestFiles: mod.latestFiles })
    window.api.openExternal(websiteUrl)
  }

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
        // a 403 means the author blocked API downloads — flip to "open on site"
        // instead of a useless retry loop
        if (/\b403\b/.test(res?.error || '') && websiteUrl) {
          setApiBlocked(true)
          setDlState('idle')
        } else {
          setDlState('error')
        }
      }
    } catch (err) {
      console.error(`[CurseForge] ${mode} threw:`, err)
      setDlState('error')
    }
  }

  // Distribution-blocked mods can't be pulled through the API at all — offer the
  // website instead of a download button that would only ever fail.
  if (distributionBlocked && dlState !== 'downloading' && dlState !== 'done') {
    return (
      <button
        onClick={openSite}
        title={t('curseforge.distBlockedTip')}
        className={`btn-ghost ${className}`}
      >
        <ArrowSquareOut {...ICON} /> {t('curseforge.openOnSite')}
      </button>
    )
  }

  const pct = progress?.total ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : null
  const installing = progress?.phase === 'installing'

  const label =
    dlState === 'downloading'
      ? installing
        ? <><Package {...ICON} /> {t('curseforge.installing')}</>
        : pct != null
          ? <><CircleNotch {...ICON} className="animate-spin" /> {`${pct}% · ${formatBytes(progress.received)}${progress.total ? ` / ${formatBytes(progress.total)}` : ''}`}</>
          : <><CircleNotch {...ICON} className="animate-spin" /> {t('curseforge.downloading')}</>
      : dlState === 'done'
        ? <><Check {...ICON} /> {mode === 'update' ? t('curseforge.updated') : t('curseforge.downloaded')}</>
        : dlState === 'error'
          ? <><Warning {...ICON} /> {t('curseforge.failedRetry')}</>
          : mode === 'update'
            ? <><ArrowUp {...ICON} /> {t('curseforge.updateBtn')}</>
            : installed
              ? <><ArrowsClockwise {...ICON} /> {t('curseforge.redownload')}</>
              : <><DownloadSimple {...ICON} /> {t('curseforge.download')}</>

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
          className="absolute inset-x-0 bottom-0 h-0.5 bg-emerald-400 transition-[width] duration-200"
          style={{ width: `${pct}%` }}
        />
      )}
    </button>
  )
}
