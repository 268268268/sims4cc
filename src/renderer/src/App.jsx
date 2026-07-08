import { useState, useEffect } from 'react'
import Layout from './components/Layout'
import Plumbob from './components/Plumbob'
import DropZone from './components/DropZone'
import Welcome from './pages/Welcome'
import LocalMods from './pages/LocalMods'
import Creators from './pages/Creators'
import CurseForge from './pages/CurseForgeBrowser'
import Discover from './pages/Discover'
import Settings from './pages/Settings'

const PAGES = {
  'local-mods': LocalMods,
  'creators': Creators,
  'curseforge': CurseForge,
  'discover': Discover,
  'settings': Settings
}

export default function App() {
  const [modsFolder, setModsFolder] = useState(undefined) // undefined = loading
  const [activePage, setActivePage] = useState('local-mods')

  useEffect(() => {
    window.api.getConfig().then(cfg => setModsFolder(cfg.modsFolder ?? null))
  }, [])

  // Still loading config
  if (modsFolder === undefined) {
    return (
      <div className="flex h-screen app-bg items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Plumbob size={44} spin />
          <div className="text-gray-500 text-sm">Loading…</div>
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
    <>
      <Layout activePage={activePage} onNavigate={setActivePage}>
        <PageComponent
          modsFolder={modsFolder}
          onFolderChanged={setModsFolder}
        />
      </Layout>
      <DropZone />
    </>
  )
}
