const NAV_ITEMS = [
  { id: 'local-mods', label: 'Local Mods', icon: '📦' },
  { id: 'creators', label: 'Creators', icon: '🎨' },
  { id: 'curseforge', label: 'CurseForge', icon: '🔥' },
  { id: 'custom-catalog', label: 'Custom Catalog', icon: '📚' },
  { id: 'settings', label: 'Settings', icon: '⚙️' }
]

export default function Sidebar({ activePage, onNavigate }) {
  return (
    <aside className="w-56 shrink-0 bg-gray-900 border-r border-gray-700 flex flex-col">
      <div className="px-4 py-5 border-b border-gray-700">
        <h1 className="text-lg font-bold text-purple-400 leading-tight">
          Sims 4<br />
          <span className="text-white">Mod Manager</span>
        </h1>
      </div>

      <nav className="flex-1 py-3">
        {NAV_ITEMS.map(({ id, label, icon }) => (
          <button
            key={id}
            onClick={() => onNavigate(id)}
            className={`w-full flex items-center gap-3 px-4 py-3 text-sm font-medium transition-colors text-left
              ${activePage === id
                ? 'bg-purple-600 text-white'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
          >
            <span className="text-base">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      <div className="px-4 py-3 border-t border-gray-700 text-xs text-gray-600">
        v1.0.0
      </div>
    </aside>
  )
}
