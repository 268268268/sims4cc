import { useState, useEffect, useRef } from 'react'
import { DownloadSimple, CircleNotch, CheckCircle, WarningCircle, X, Package } from '@phosphor-icons/react'
import { markChanged } from '../lib/sessionActivity'
import { useT } from '../lib/i18n'

const MAX_TOASTS = 4       // keep the newest few; older un-acted prompts drop off
const AUTO_DISMISS_MS = 45000 // an ignored idle/error prompt clears itself

/**
 * "Download helper" toast. When the user grabs a distribution-blocked mod from
 * its CurseForge page in their browser, the main process (downloadWatcher)
 * notices the fresh file in Downloads and pushes it here. We only OFFER to
 * install — the user confirms; nothing is auto-installed and nothing is scraped.
 */
function CatchToast({ item, onClose }) {
  const { t } = useT()
  const [state, setState] = useState('idle') // idle | installing | done | error
  const [error, setError] = useState(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  // An ignored prompt (idle) or a failed one (error) clears itself so toasts
  // never pile up; 'installing' is left alone and 'done' closes on its own timer.
  useEffect(() => {
    if (state !== 'idle' && state !== 'error') return
    const timer = setTimeout(() => closeRef.current?.(), AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [state])

  const install = async () => {
    setState('installing')
    setError(null)
    try {
      // routes through cfHelper:install so a known CurseForge mod is also recorded
      // as installed (the browser's Installed badge reads that store)
      const res = await window.api.installCaughtFile({ path: item.path, mod: item.mod ?? null })
      if (res?.ok) {
        setState('done')
        markChanged()
        window.dispatchEvent(new CustomEvent('local-mods-changed'))
        if (res.recordedModId) {
          window.dispatchEvent(new CustomEvent('curseforge-installed', { detail: { modId: res.recordedModId } }))
        }
        setTimeout(onClose, 2500)
      } else {
        setError(res?.error || (res?.results ?? []).find(r => !r.ok)?.error || t('curseforge.caughtFailed'))
        setState('error')
      }
    } catch (e) {
      setError(e.message)
      setState('error')
    }
  }

  return (
    <div className="card p-3 w-80 shadow-xl shadow-black/40 border border-emerald-500/20 flex flex-col gap-2 pointer-events-auto">
      <div className="flex items-start gap-2">
        <DownloadSimple size={18} weight="fill" className="text-emerald-400 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <p className="text-white text-sm font-semibold leading-tight">{t('curseforge.caughtTitle')}</p>
          <p className="text-gray-400 text-xs truncate" title={item.name}>{item.name}</p>
        </div>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 shrink-0" title={t('discover.close')}>
          <X size={14} weight="bold" />
        </button>
      </div>
      {state === 'idle' && (
        <button onClick={install} className="btn-primary px-3 py-1.5 text-xs w-full">
          <Package size={14} weight="bold" /> {t('curseforge.caughtInstall')}
        </button>
      )}
      {state === 'installing' && (
        <div className="text-gray-400 text-xs flex items-center gap-1.5 justify-center py-1.5">
          <CircleNotch size={14} weight="bold" className="animate-spin" /> {t('curseforge.installing')}
        </div>
      )}
      {state === 'done' && (
        <div className="text-emerald-400 text-xs flex items-center gap-1.5 justify-center py-1.5">
          <CheckCircle size={14} weight="fill" /> {t('curseforge.caughtInstalled')}
        </div>
      )}
      {state === 'error' && (
        <div className="text-red-400 text-xs flex items-start gap-1.5 py-1">
          <WarningCircle size={14} weight="fill" className="shrink-0 mt-0.5" /> <span className="flex-1">{error}</span>
        </div>
      )}
    </div>
  )
}

export default function DownloadCatcher() {
  const [items, setItems] = useState([]) // [{ path, name, id }]

  useEffect(() => {
    const off = window.api.onDownloadDetected?.((p) => {
      if (!p?.path) return
      // dedupe by path; cap the stack so bursts can't pile up off-screen
      setItems(prev => (prev.some(x => x.id === p.path) ? prev : [...prev, { ...p, id: p.path }].slice(-MAX_TOASTS)))
    })
    return () => off?.()
  }, [])

  const remove = (id) => setItems(prev => prev.filter(x => x.id !== id))

  if (!items.length) return null
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
      {items.map(it => <CatchToast key={it.id} item={it} onClose={() => remove(it.id)} />)}
    </div>
  )
}
