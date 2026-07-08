import { useState, useRef, useEffect } from 'react'
import { SquaresFour, CaretDown, MagnifyingGlass } from '@phosphor-icons/react'

/** Dropdown to pick a CurseForge category (or "All"), with a type-to-filter box. */
export default function CategoryFilter({ categories, selectedId, onSelect }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const selected = categories.find(c => c.id === selectedId)
  const needle = q.trim().toLowerCase()
  const shown = needle ? categories.filter(c => c.name.toLowerCase().includes(needle)) : categories

  const pick = (id) => { onSelect(id); setOpen(false); setQ('') }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`chip ${selectedId ? 'chip-active' : ''}`}
        title="Filter by category"
      >
        {selected?.iconUrl
          ? <img src={selected.iconUrl} alt="" className="w-3.5 h-3.5 rounded-sm" />
          : <SquaresFour size={14} weight="regular" />}
        <span className="max-w-[10rem] truncate">{selected ? selected.name : 'All categories'}</span>
        <CaretDown size={11} weight="bold" className="opacity-70" />
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-64 z-30 glass rounded-xl shadow-2xl shadow-black/60 overflow-hidden fade-in-up">
          {categories.length > 8 && (
            <div className="p-2 border-b border-white/5">
              <div className="relative">
                <MagnifyingGlass size={13} weight="bold" className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                <input
                  autoFocus
                  value={q}
                  onChange={e => setQ(e.target.value)}
                  placeholder="Filter categories…"
                  className="input w-full pl-7 pr-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
          )}
          <div className="max-h-72 overflow-y-auto p-1">
            <button
              onClick={() => pick(null)}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors ${!selectedId ? 'bg-emerald-600/20 text-emerald-200' : 'text-gray-300 hover:bg-white/5'}`}
            >
              <SquaresFour size={16} weight="regular" className="shrink-0" /> All categories
            </button>
            {shown.map(c => (
              <button
                key={c.id}
                onClick={() => pick(c.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors ${c.id === selectedId ? 'bg-emerald-600/20 text-emerald-200' : 'text-gray-300 hover:bg-white/5'}`}
              >
                {c.iconUrl
                  ? <img src={c.iconUrl} alt="" className="w-4 h-4 rounded-sm shrink-0" />
                  : <span className="w-4 h-4 shrink-0" />}
                <span className="truncate">{c.name}</span>
              </button>
            ))}
            {shown.length === 0 && (
              <p className="px-2.5 py-3 text-gray-600 text-xs text-center">No categories match.</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
