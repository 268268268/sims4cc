import { useState } from 'react'
import { Broom, Check, X } from '@phosphor-icons/react'
import Sidebar from './Sidebar'
import { useSessionActivity } from '../lib/sessionActivity'
import { useT } from '../lib/i18n'

function CacheBanner() {
  const { t } = useT()
  const { count, dismiss } = useSessionActivity()
  const [state, setState] = useState('idle') // idle | clearing | done

  if (count === 0) return null

  const onClear = async () => {
    setState('clearing')
    try {
      const res = await window.api.clearGameCache()
      setState(res?.success ? 'done' : 'idle')
      if (res?.success) setTimeout(dismiss, 1500)
    } catch {
      setState('idle')
    }
  }

  return (
    <div className="shrink-0 px-4 py-2 bg-amber-950/50 border-b border-amber-800/40 flex items-center gap-3 text-xs text-amber-200">
      <Broom size={16} weight="fill" className="shrink-0 text-amber-300" />
      <span>{t('cacheBanner.message')}</span>
      <button
        onClick={onClear}
        disabled={state !== 'idle'}
        className="btn-ghost px-2.5 py-1 text-xs ml-auto shrink-0"
      >
        {state === 'clearing' ? t('cacheBanner.clearing') : state === 'done' ? <><Check size={14} weight="bold" /> {t('cacheBanner.cleared')}</> : t('cacheBanner.clearCache')}
      </button>
      <button onClick={dismiss} className="text-amber-400 hover:text-amber-100 shrink-0" title={t('cacheBanner.dismiss')}><X size={14} weight="bold" /></button>
    </div>
  )
}

export default function Layout({ activePage, onNavigate, discoverSource, onDiscoverSource, children }) {
  return (
    <div className="flex h-screen app-bg text-white overflow-hidden">
      <Sidebar
        activePage={activePage}
        onNavigate={onNavigate}
        discoverSource={discoverSource}
        onDiscoverSource={onDiscoverSource}
      />
      <main className="flex-1 flex flex-col overflow-hidden">
        <CacheBanner />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
