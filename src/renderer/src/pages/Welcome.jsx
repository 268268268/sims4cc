import { useState } from 'react'

export default function Welcome({ onFolderSelected }) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  async function handleSelect() {
    setLoading(true)
    setError(null)
    try {
      const folder = await window.api.selectFolder()
      if (!folder) { setLoading(false); return }
      await window.api.setConfig('modsFolder', folder)
      onFolderSelected(folder)
    } catch (err) {
      setError(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen bg-gray-950 items-center justify-center">
      <div className="max-w-md w-full mx-4 text-center">
        <div className="text-6xl mb-6">🎮</div>
        <h1 className="text-3xl font-bold text-white mb-2">Welcome to</h1>
        <h2 className="text-3xl font-bold text-purple-400 mb-6">Sims 4 Mod Manager</h2>
        <p className="text-gray-400 mb-8 leading-relaxed">
          To get started, select your Sims 4 <strong className="text-gray-200">Mods</strong> folder.
          This is usually located at:
          <br />
          <code className="text-xs text-purple-300 bg-gray-800 px-2 py-1 rounded mt-2 inline-block">
            Documents/Electronic Arts/The Sims 4/Mods
          </code>
        </p>

        <button
          onClick={handleSelect}
          disabled={loading}
          className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 disabled:cursor-not-allowed
            text-white font-semibold py-3 px-6 rounded-lg transition-colors text-lg"
        >
          {loading ? 'Opening…' : '📁 Select Mods Folder'}
        </button>

        {error && (
          <p className="mt-4 text-red-400 text-sm bg-red-950 border border-red-800 rounded-lg px-4 py-2">
            Error: {error}
          </p>
        )}
      </div>
    </div>
  )
}
