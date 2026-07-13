import { useState, useRef, useEffect } from 'react'
import { SquaresFour, CaretDown, MagnifyingGlass, Check } from '@phosphor-icons/react'
import { useT } from '../lib/i18n'

/**
 * Multi-select dropdown to narrow by CurseForge leaf categories (AND-combined),
 * with a type-to-filter box. Selected ids are controlled by the parent.
 */
export default function CategoryFilter({ categories, selectedIds = [], onToggle, onClear }) {
  const { t } = useT()
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

  const count = selectedIds.length
  const needle = q.trim().toLowerCase()
  const shown = needle ? categories.filter(c => c.name.toLowerCase().includes(needle)) : categories

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className={`chip ${count ? 'chip-active' : ''}`}
        title={t('curseforge.filterByCategory')}
      >
        <SquaresFour size={14} weight="regular" />
        <span className="max-w-[10rem] truncate">
          {count ? t('curseforge.categoriesCount', { count }) : t('curseforge.allCategories')}
        </span>
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
                  placeholder={t('curseforge.filterCategoriesPlaceholder')}
                  className="input w-full pl-7 pr-2.5 py-1.5 text-xs"
                />
              </div>
            </div>
          )}
          <div className="max-h-72 overflow-y-auto p-1">
            {count > 0 && (
              <button
                onClick={onClear}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs text-gray-400 hover:bg-white/5"
              >
                <SquaresFour size={16} weight="regular" className="shrink-0" /> {t('curseforge.clearCount', { count })}
              </button>
            )}
            {shown.map(c => {
              const on = selectedIds.includes(c.id)
              return (
                <button
                  key={c.id}
                  onClick={() => onToggle(c.id)}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-sm transition-colors ${on ? 'bg-emerald-600/20 text-emerald-200' : 'text-gray-300 hover:bg-white/5'}`}
                >
                  <span className={`w-4 h-4 shrink-0 rounded border flex items-center justify-center ${on ? 'bg-emerald-500 border-emerald-500' : 'border-white/20'}`}>
                    {on && <Check size={11} weight="bold" className="text-black" />}
                  </span>
                  <span className="truncate">{c.name}</span>
                </button>
              )
            })}
            {shown.length === 0 && (
              <p className="px-2.5 py-3 text-gray-600 text-xs text-center">{t('curseforge.noCategoriesMatch')}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
