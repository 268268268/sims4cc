import { useState } from 'react'
import { Package, Globe, GearSix, CaretDoubleLeft, CaretDoubleRight } from '@phosphor-icons/react'
import Plumbob from './Plumbob'
import SourceIcon from './SourceIcon'
import { useT } from '../lib/i18n'

const NAV_ITEMS = [
  { id: 'local-mods', labelKey: 'nav.localMods', Icon: Package },
  { id: 'curseforge', labelKey: 'nav.curseforge', brand: 'curseforge' },
  { id: 'discover', labelKey: 'nav.discover', Icon: Globe },
  { id: 'settings', labelKey: 'nav.settings', Icon: GearSix }
]

// Discover source sub-nav. Patreon is the default (the source that actually works);
// the rest are supported but usually empty until the user follows something there.
const DISCOVER_SOURCES = [
  { id: 'all', labelKey: 'nav.allSources' },
  { id: 'patreon', labelKey: 'nav.patreon' },
  { id: 'modthesims', labelKey: 'nav.modthesims' },
  { id: 'tumblr', labelKey: 'nav.tumblr' },
  { id: 'pinterest', labelKey: 'nav.pinterest' }
]

export default function Sidebar({ activePage, onNavigate, discoverSource, onDiscoverSource }) {
  const { t } = useT()
  // ponytail: local state + localStorage — collapse only affects this component, no need to lift to App
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const toggle = () => setCollapsed(c => {
    localStorage.setItem('sidebar-collapsed', c ? '0' : '1')
    return !c
  })

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 overflow-hidden bg-white/[0.03] backdrop-blur-2xl backdrop-saturate-150
        border-r border-white/10 shadow-[inset_-1px_0_0_rgba(255,255,255,0.05)] flex flex-col
        transition-[width] duration-300 ease-in-out`}
    >
      <div className={`h-[76px] flex items-center border-b border-white/5 ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
        {collapsed ? (
          <Plumbob size={30} />
        ) : (
          <h1 className="text-lg font-bold leading-tight tracking-tight whitespace-nowrap">
            <span className="bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">Sims 4</span>
            <br />
            <span className="text-white">{t('nav.brandLine2')}</span>
          </h1>
        )}
      </div>

      <nav className="flex-1 py-4 px-3 flex flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(({ id, labelKey, Icon, brand }) => {
          const active = activePage === id
          const label = t(labelKey)
          return (
            <div key={id}>
              <button
                onClick={() => onNavigate(id)}
                title={collapsed ? label : undefined}
                className={`w-full flex items-center gap-3 py-2.5 text-sm font-medium rounded-lg whitespace-nowrap
                  ${collapsed ? 'justify-center px-0' : 'px-3.5 text-left'}
                  transition-colors duration-150
                  ${active
                    ? 'bg-gradient-to-r from-emerald-600/90 to-teal-600/70 text-white shadow-md shadow-emerald-950/40'
                    : 'text-gray-400 hover:bg-white/5 hover:text-white'
                  }`}
              >
                {brand
                  ? <SourceIcon type={brand} size={19} className="shrink-0" />
                  : <Icon size={20} weight={active ? 'fill' : 'regular'} className="shrink-0" />}
                {!collapsed && label}
                {!collapsed && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-white/80" />}
              </button>

              {/* Source sub-nav — only under an open Discover, expanded sidebar */}
              {id === 'discover' && active && !collapsed && (
                <div className="mt-1 ml-4 pl-3 border-l border-white/10 flex flex-col gap-0.5">
                  {DISCOVER_SOURCES.map(({ id: sid, labelKey: slabelKey }) => {
                    const slabel = t(slabelKey)
                    const on = (discoverSource ?? 'patreon') === sid
                    return (
                      <button
                        key={sid}
                        onClick={() => onDiscoverSource?.(sid)}
                        className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs whitespace-nowrap text-left
                          transition-colors ${on ? 'bg-emerald-500/15 text-emerald-200' : 'text-gray-500 hover:text-gray-200 hover:bg-white/5'}`}
                      >
                        <SourceIcon type={sid} size={14} className="shrink-0" />
                        {slabel}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>

      <div className={`border-t border-white/5 py-3 flex items-center ${collapsed ? 'justify-center px-0' : 'px-4 justify-between'}`}>
        {!collapsed && <span className="text-xs text-gray-600">v1.0.0</span>}
        <button
          onClick={toggle}
          title={collapsed ? t('nav.expandSidebar') : t('nav.collapseSidebar')}
          className="p-1.5 rounded-lg text-gray-500 hover:text-white hover:bg-white/5 transition-colors"
        >
          {collapsed ? <CaretDoubleRight size={16} weight="bold" /> : <CaretDoubleLeft size={16} weight="bold" />}
        </button>
      </div>
    </aside>
  )
}
