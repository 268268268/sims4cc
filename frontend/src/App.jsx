import { useState, useEffect, useCallback } from 'react'
import Layout from './components/Layout'
import Plumbob from './components/Plumbob'
import { useT } from './lib/i18n'
import DropZone from './components/DropZone'
import DownloadCatcher from './components/DownloadCatcher'
import { DownloadQueueProvider } from './context/DownloadQueueContext'
import DownloadQueueDrawer from './components/DownloadQueueDrawer'
import Welcome from './pages/Welcome'
import LocalMods from './pages/LocalMods'
import CCSwiper from './pages/CCSwiper'
import CurseForge from './pages/CurseForgeBrowser'
import Discover from './pages/Discover'
import Settings from './pages/Settings'
import UpdateBanner from './components/UpdateBanner'

const PAGES = {
  'local-mods': LocalMods,
  'cc-swiper': CCSwiper,
  'curseforge': CurseForge,
  'discover': Discover,
  'settings': Settings
}

export default function App() {
  const { t } = useT()
  const [modsFolder, setModsFolder] = useState(undefined) // undefined = loading
  const [activePage, setActivePage] = useState('local-mods')
  const [discoverSource, setDiscoverSource] = useState('patreon') // Discover source sub-nav selection
  const [pendingAuthor, setPendingAuthor] = useState(null) // author to open after a cross-page jump

  useEffect(() => {
    window.api.getConfig()
      .then(cfg => setModsFolder(cfg?.modsFolder ?? null))
      .catch(err => {
        console.error('Failed to load config:', err)
        setModsFolder(null)
      })
  }, [])

  // Open a history entry: switch to its tab (no-op if already there) and hand the
  // author to that page via pendingAuthor. The _n nonce re-triggers even on a repeat.
  const navigateToAuthor = useCallback((entry) => {
    setActivePage(entry.type === 'curseforge' ? 'curseforge' : 'discover')
    setPendingAuthor({ ...entry, _n: Date.now() })
  }, [])
  const clearPendingAuthor = useCallback(() => setPendingAuthor(null), [])

  // Still loading config
  if (modsFolder === undefined) {
    return (
      <div className="flex h-screen app-bg items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Plumbob size={44} spin />
          <div className="text-gray-500 text-sm">{t('common.loading')}</div>
        </div>
      </div>
    )
  }

  // First launch — no folder configured
  if (modsFolder === null) {
    return <Welcome onFolderSelected={setModsFolder} />
  }

  const PageComponent = PAGES[activePage]

  return (
    <DownloadQueueProvider>
      <Layout
        activePage={activePage}
        onNavigate={setActivePage}
        discoverSource={discoverSource}
        onDiscoverSource={setDiscoverSource}
      >
        <PageComponent
          modsFolder={modsFolder}
          onFolderChanged={setModsFolder}
          source={discoverSource}
          pendingAuthor={pendingAuthor}
          onNavigateAuthor={navigateToAuthor}
          onPendingAuthorConsumed={clearPendingAuthor}
          onNavigate={setActivePage}
        />
      </Layout>
      <DropZone />
      <DownloadCatcher />
      <DownloadQueueDrawer />
      <UpdateBanner onNavigate={setActivePage} />
    </DownloadQueueProvider>
  )
}
