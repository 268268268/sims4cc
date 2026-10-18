import { useState, useRef, useEffect } from 'react'
import { ClockCounterClockwise, CaretDown } from '@phosphor-icons/react'
import SourceIcon from './SourceIcon'
import { formatRelative } from '../lib/format'
import { getAuthorHistory, clearAuthorHistory, onAuthorHistoryChange } from '../lib/authorHistory'

const TYPE_TINT = {
  patreon: 'text-orange-300',
  tumblr: 'text-sky-300',
  pinterest: 'text-red-300',
  modthesims: 'text-emerald-300',
  curseforge: 'text-amber-300'
}

const entryKey = (e) => (e.type === 'curseforge' ? `cf${e.id}` : `dc${e.sourceId}`)

/**
 * "Recent" dropdown — the shared history of viewed authors across CurseForge and
 * Discover. onPick(entry) hands the entry back to the parent, which routes to the
 * right tab + opens the author. Refreshes live via the history change event.
 */
export default function RecentAuthors({ onPick }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(getAuthorHistory)
  const ref = useRef(null)

  useEffect(() => onAuthorHistoryChange(() => setItems(getAuthorHistory())), [])
  useEffect(() => {
    if (!open) return
    setItems(getAuthorHistory()) // freshest on open
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)} className={`chip ${open ? 'chip-active' : ''}`} title="Recently viewed authors">
        <ClockCounterClockwise size={14} weight="bold" /> Recent
        {items.length > 0 && <span className="badge bg-white/10 text-gray-300 ml-1">{items.length}</span>}
        <CaretDown size={11} weight="bold" className="opacity-70" />
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 z-30 glass rounded-xl shadow-2xl shadow-black/60 overflow-hidden fade-in-up">
          <div className="px-3 py-2 border-b border-white/5 flex items-center justify-between">
            <span className="text-gray-400 text-xs">Recently viewed</span>
            {items.length > 0 && (
              <button onClick={() => clearAuthorHistory()} className="text-gray-500 hover:text-red-400 text-xs">Clear</button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto p-1">
            {items.length === 0 && (
              <p className="px-3 py-6 text-center text-gray-600 text-xs">No history yet — open an author to start.</p>
            )}
            {items.map(e => (
              <button
                key={entryKey(e)}
                onClick={() => { setOpen(false); onPick(e) }}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-white/5 transition-colors"
              >
                {e.avatarUrl
                  ? <img src={e.avatarUrl} alt="" className="w-7 h-7 rounded-full shrink-0 object-cover bg-white/5" onError={ev => { ev.currentTarget.style.visibility = 'hidden' }} />
                  : <span className="w-7 h-7 rounded-full shrink-0 bg-emerald-600/20 flex items-center justify-center text-emerald-300 text-xs font-bold">{(e.name || '?').slice(0, 1).toUpperCase()}</span>}
                <span className="flex flex-col min-w-0 flex-1">
                  <span className="text-gray-200 text-sm truncate">{e.name}</span>
                  {e.at && <span className="text-gray-600 text-[11px] truncate">{formatRelative(new Date(e.at).toISOString())}</span>}
                </span>
                <SourceIcon
                  type={e.type === 'curseforge' ? 'curseforge' : e.sourceType}
                  size={14}
                  className={`shrink-0 ${TYPE_TINT[e.type === 'curseforge' ? 'curseforge' : e.sourceType] ?? 'text-gray-400'}`}
                />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
