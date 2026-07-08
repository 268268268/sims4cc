import { useState } from 'react'
import { Package, PaintBrush, Fire, Globe, GearSix, CaretDoubleLeft, CaretDoubleRight } from '@phosphor-icons/react'
import Plumbob from './Plumbob'

const NAV_ITEMS = [
  { id: 'local-mods', label: 'Local Mods', Icon: Package },
  { id: 'creators', label: 'Creators', Icon: PaintBrush },
  { id: 'curseforge', label: 'CurseForge', Icon: Fire },
  { id: 'discover', label: 'Discover', Icon: Globe },
  { id: 'settings', label: 'Settings', Icon: GearSix }
]

export default function Sidebar({ activePage, onNavigate }) {
  // ponytail: local state + localStorage — collapse only affects this component, no need to lift to App
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const toggle = () => setCollapsed(c => {
    localStorage.setItem('sidebar-collapsed', c ? '0' : '1')
    return !c
  })

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 bg-white/[0.03] backdrop-blur-2xl backdrop-saturate-150
        border-r border-white/10 shadow-[inset_-1px_0_0_rgba(255,255,255,0.05)] flex flex-col
        transition-[width] duration-200`}
    >
      <div className={`h-[76px] flex items-center border-b border-white/5 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
        {collapsed ? (
          <Plumbob size={30} />
        ) : (
          <h1 className="text-lg font-bold leading-tight tracking-tight">
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Sims 4</span>
            <br />
            <span className="text-white">Mod Manager</span>
          </h1>
        )}
      </div>

      <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
        {NAV_ITEMS.map(({ id, label, Icon }) => {
          const active = activePage === id
          return (
            <button
              key={id}
              onClick={() => onNavigate(id)}
              title={collapsed ? label : undefined}
              className={`w-full flex items-center gap-3 py-2.5 text-sm font-medium rounded-lg
                ${collapsed ? 'justify-center px-0' : 'px-3.5 text-left'}
                transition-colors duration-150
                ${active
                  ? 'bg-gradient-to-r from-emerald-600/90 to-teal-600/70 text-white shadow-md shadow-emerald-950/40'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
            >
              <Icon
                size={20}
                weight={active ? 'fill' : 'regular'}
                className={`shrink-0 transition-transform duration-150 ${active && !collapsed ? 'scale-110' : ''}`}
              />
              {!collapsed && label}
              {!collapsed && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />}
            </button>
          )
        })}
      </nav>

      <div className={`border-t border-white/5 py-3 flex items-center ${collapsed ? 'justify-center px-0' : 'px-4 justify-between'}`}>
        {!collapsed && <span className="text-xs text-gray-600">v1.0.0</span>}
        <button
          onClick={toggle}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          {collapsed ? <CaretDoubleRight size={16} weight="bold" /> : <CaretDoubleLeft size={16} weight="bold" />}
        </button>
      </div>
    </aside>
  )
}
