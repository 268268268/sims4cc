import { useState } from 'react'
import Sidebar from './Sidebar'
import { useSessionActivity } from '../lib/sessionActivity'

function CacheBanner() {
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
      <span>🧹 You changed mods this session — clear the game cache before playing to avoid thumbnail glitches.</span>
      <button
        onClick={onClear}
        disabled={state !== 'idle'}
        className="btn-ghost px-2.5 py-1 text-xs ml-auto shrink-0"
      >
        {state === 'clearing' ? 'Clearing…' : state === 'done' ? '✓ Cleared' : 'Clear cache'}
      </button>
      <button onClick={dismiss} className="text-amber-400 hover:text-amber-100 shrink-0" title="Dismiss">✕</button>
    </div>
  )
}

export default function Layout({ activePage, onNavigate, children }) {
  return (
    <div className="flex h-screen app-bg text-white overflow-hidden">
      <Sidebar activePage={activePage} onNavigate={onNavigate} />
      <main className="flex-1 flex flex-col overflow-hidden">
        <CacheBanner />
        <div className="flex-1 overflow-y-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
