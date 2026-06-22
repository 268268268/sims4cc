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
    <div className="p-8 max-w-2xl">
      <h2 className="text-2xl font-bold text-white mb-8">Settings</h2>

      {/* Mods Folder */}
      <section className="mb-8">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Mods Folder
        </h3>
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <p className="text-xs text-gray-500 mb-1">Current path</p>
          <p className="text-gray-200 font-mono text-sm break-all mb-4">
            {modsFolder ?? <span className="text-red-400">Not configured</span>}
          </p>
          <button
            onClick={handleChangeFolder}
            disabled={folderLoading}
            className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white text-sm
              font-medium py-2 px-4 rounded-lg transition-colors"
          >
            {folderLoading ? 'Opening…' : '📁 Change Mods Folder'}
          </button>
        </div>
      </section>

      {/* Game Cache */}
      <section>
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
          Game Cache
        </h3>
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4">
          <p className="text-gray-400 text-sm mb-4 leading-relaxed">
            Deletes <code className="text-purple-300 bg-gray-800 px-1 rounded">localthumbcache.package</code> from
            your Sims 4 folder. The game will regenerate it on next launch.
            Do this after installing or removing mods to fix thumbnail glitches.
          </p>
          <button
            onClick={handleClearCache}
            disabled={cacheStatus === 'loading' || !modsFolder}
            className="bg-red-700 hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed
              text-white font-semibold py-2 px-5 rounded-lg transition-colors text-sm"
          >
            {cacheStatus === 'loading' ? '🗑️ Deleting…' : '🗑️ Clear Game Cache'}
          </button>

          {!modsFolder && (
            <p className="mt-3 text-yellow-500 text-xs">
              Configure your Mods folder first.
            </p>
          )}

          {cacheStatus && cacheStatus !== 'loading' && (
            <div className={`mt-4 text-sm px-4 py-2 rounded-lg border ${
              cacheStatus.success
                ? 'text-green-300 bg-green-950 border-green-800'
                : 'text-red-300 bg-red-950 border-red-800'
            }`}>
              {cacheStatus.success ? '✅' : '❌'} {cacheStatus.msg}
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
