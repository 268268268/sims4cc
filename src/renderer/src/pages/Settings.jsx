import { useState } from 'react'

export default function Settings({ modsFolder, onFolderChanged }) {
  const [cacheStatus, setCacheStatus] = useState(null) // null | 'loading' | {success, msg}
  const [folderLoading, setFolderLoading] = useState(false)

  async function handleChangeFolder() {
    setFolderLoading(true)
    try {
      const folder = await window.api.selectFolder()
      if (!folder) { setFolderLoading(false); return }
      await window.api.setConfig('modsFolder', folder)
      onFolderChanged(folder)
    } catch (err) {
      console.error('Failed to change folder:', err)
    }
    setFolderLoading(false)
  }

  async function handleClearCache() {
    setCacheStatus('loading')
    const result = await window.api.clearGameCache()
    if (result.success) {
      setCacheStatus({
        success: true,
        msg: result.alreadyGone
          ? 'Cache file was already gone — nothing to delete.'
          : 'localthumbcache.package deleted successfully!'
      })
    } else {
      setCacheStatus({ success: false, msg: result.error })
    }
    // auto-clear status after 5s
    setTimeout(() => setCacheStatus(null), 5000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-white/5 shrink-0">
        <h2 className="page-title">Settings</h2>
        <p className="page-subtitle">Configure folders and maintenance actions</p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6 max-w-2xl">
        {/* Mods Folder */}
        <section className="mb-6 fade-in-up">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Mods Folder
          </h3>
          <div className="card p-5">
            <p className="text-xs text-gray-500 mb-1">Current path</p>
            <p className="text-gray-200 font-mono text-sm break-all mb-4">
              {modsFolder ?? <span className="text-red-400">Not configured</span>}
            </p>
            <button
              onClick={handleChangeFolder}
              disabled={folderLoading}
              className="btn-ghost py-2 px-4 text-sm"
            >
              {folderLoading ? 'Opening…' : '📁 Change Mods Folder'}
            </button>
          </div>
        </section>

        {/* Game Cache */}
        <section className="fade-in-up">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            Game Cache
          </h3>
          <div className="card p-5">
            <p className="text-gray-400 text-sm mb-4 leading-relaxed">
              Deletes <code className="text-violet-300 bg-white/5 border border-white/10 px-1.5 py-0.5 rounded">localthumbcache.package</code> from
              your Sims 4 folder. The game will regenerate it on next launch.
              Do this after installing or removing mods to fix thumbnail glitches.
            </p>
            <button
              onClick={handleClearCache}
              disabled={cacheStatus === 'loading' || !modsFolder}
              className="btn-danger py-2 px-5 text-sm font-semibold"
            >
              {cacheStatus === 'loading' ? '🗑️ Deleting…' : '🗑️ Clear Game Cache'}
            </button>

            {!modsFolder && (
              <p className="mt-3 text-amber-400 text-xs">
                Configure your Mods folder first.
              </p>
            )}

            {cacheStatus && cacheStatus !== 'loading' && (
              <div className={`mt-4 text-sm px-4 py-2 rounded-xl border ${
                cacheStatus.success
                  ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/60'
                  : 'text-red-300 bg-red-950/60 border-red-800/60'
              }`}>
                {cacheStatus.success ? '✅' : '❌'} {cacheStatus.msg}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
