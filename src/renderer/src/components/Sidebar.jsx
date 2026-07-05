const NAV_ITEMS = [
  { id: 'local-mods', label: 'Local Mods', icon: '📦' },
  { id: 'creators', label: 'Creators', icon: '🎨' },
  { id: 'curseforge', label: 'CurseForge', icon: '🔥' },
  { id: 'custom-catalog', label: 'Custom Catalog', icon: '📚' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="w-60 shrink-0 bg-black/30 backdrop-blur border-r border-white/5 flex flex-col">
      <div className="px-5 py-6 border-b border-white/5">
        <h1 className="text-lg font-bold leading-tight tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-fuchsia-400 bg-clip-text text-transparent">
            Sims 4
          </span>
          <br />
          <span className="text-white">Mod Manager</span>
        </h1>
      </div>

      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, icon }) => {
          const active = activePage === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium rounded-lg text-left
                transition-all duration-150
                ${active
                  ? 'bg-gradient-to-r from-violet-600/90 to-fuchsia-600/70 text-white shadow-md shadow-violet-950/40'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
            >
              <span className={`text-base transition-transform duration-150 ${active ? 'scale-110' : ''}`}>
                {icon}
              </span>
              {label}
              {active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />}
            </button>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-white/5 text-xs text-gray-600">
        v1.0.0
      </div>
    </aside>
  )
}
