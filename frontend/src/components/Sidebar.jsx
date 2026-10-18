import { useState } from 'react'
import { Package, Globe, GearSix, CaretDoubleLeft, CaretDoubleRight, Cards, DownloadSimple, CircleNotch } from '@phosphor-icons/react'
import Plumbob from './Plumbob'
import SourceIcon from './SourceIcon'
import { useT } from '../lib/i18n'
import { useDownloadQueue } from '../context/DownloadQueueContext'

const NAV_ITEMS = [
  { id: 'local-mods', labelKey: 'nav.localMods', Icon: Package },
  { id: 'cc-swiper', labelKey: 'nav.ccSwiper', Icon: Cards },
  { id: 'curseforge', labelKey: 'nav.curseforge', brand: 'curseforge' },
  { id: 'discover', labelKey: 'nav.discover', Icon: Globe },
  { id: 'settings', labelKey: 'nav.settings', Icon: GearSix }
]

const DISCOVER_SOURCES = [
  { id: 'all', labelKey: 'nav.allSources' },
  { id: 'patreon', labelKey: 'nav.patreon' },
  { id: 'pinterest', labelKey: 'nav.pinterest' },
  { id: 'modthesims', labelKey: 'nav.modthesims' },
  { id: 'tsr', labelKey: 'nav.tsr' },
  { id: 'tumblr', labelKey: 'nav.tumblr' },
  { id: 'boosty', labelKey: 'nav.boosty' },
  { id: 'itch', labelKey: 'nav.itch' },
  { id: 'github', labelKey: 'nav.github' }
]

export default function Sidebar({ activePage, onNavigate, discoverSource, onDiscoverSource }) {
  const { t, lang } = useT()
  const { queue, activeCount, setDrawerOpen } = useDownloadQueue()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const toggle = () => setCollapsed(c => {
    localStorage.setItem('sidebar-collapsed', c ? '0' : '1')
    return !c
  })

  return (
    <aside
      className={`${collapsed ? 'w-16' : 'w-60'} shrink-0 overflow-hidden bg-[#090d0b]
        border-r border-white/[0.08] flex flex-col
        transition-[width] duration-200 ease-in-out`}
    >
      <div className={`h-[76px] flex items-center border-b border-white/[0.06] ${collapsed ? 'justify-center px-0' : 'px-5'}`}>
        {collapsed ? (
          <Plumbob size={30} />
        ) : (
          <h1 className="text-lg font-bold leading-tight tracking-tight whitespace-nowrap">
            <span className="text-emerald-400 font-bold">Sims 4</span>
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
                    ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                    : 'text-gray-400 hover:bg-white/[0.04] hover:text-white border border-transparent'
                  }`}
              >
                {brand
                  ? <SourceIcon type={brand} size={19} className="shrink-0" />
                  : <Icon size={20} weight={active ? 'fill' : 'regular'} className="shrink-0" />}
                {!collapsed && label}
                {!collapsed && active && <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400" />}
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

      {queue.length > 0 && (
        <div className="px-3 pb-2">
          <button
            onClick={() => setDrawerOpen(o => !o)}
            className={`w-full flex items-center gap-2.5 py-2 rounded-lg text-xs font-medium transition-colors
              ${collapsed ? 'justify-center px-0' : 'px-3'}
              ${activeCount > 0 ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
            title={lang === 'ru' ? 'Менеджер загрузок' : 'Download Manager'}
          >
            {activeCount > 0 ? (
              <CircleNotch size={16} weight="bold" className="animate-spin text-emerald-400 shrink-0" />
            ) : (
              <DownloadSimple size={16} weight="bold" className="text-emerald-400 shrink-0" />
            )}
            {!collapsed && (
              <span className="truncate">
                {activeCount > 0
                  ? (lang === 'ru' ? `Загрузки (${activeCount})` : `Downloading (${activeCount})`)
                  : (lang === 'ru' ? `Загрузки (${queue.length})` : `Downloads (${queue.length})`)}
              </span>
            )}
          </button>
        </div>
      )}

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
