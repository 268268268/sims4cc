import { useState, useEffect } from 'react'
import Layout from './components/Layout'
import Welcome from './pages/Welcome'
import LocalMods from './pages/LocalMods'
import CurseForge from './pages/CurseForge'
import CustomCatalog from './pages/CustomCatalog'
import Settings from './pages/Settings'

const PAGES = {
  'local-mods': LocalMods,
  'curseforge': CurseForge,
  'custom-catalog': CustomCatalog,
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
      <div className="flex h-screen bg-gray-950 items-center justify-center">
        <div className="text-gray-500 text-sm">Loading…</div>
      </div>
    )
  }

  // First launch — no folder configured
  if (modsFolder === null) {
    return <Welcome onFolderSelected={setModsFolder} />
  }

  const PageComponent = PAGES[activePage]

  return (
    <Layout activePage={activePage} onNavigate={setActivePage}>
      <PageComponent
        modsFolder={modsFolder}
        onFolderChanged={setModsFolder}
      />
    </Layout>
  )
}
