import { useState } from 'react'
import { Diamond, FolderOpen } from '@phosphor-icons/react'

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
    <div className="flex h-screen app-bg items-center justify-center">
      <div className="max-w-md w-full mx-4 text-center fade-in-up">
        <div className="flex justify-center mb-6">
          <Diamond size={72} weight="fill" className="text-emerald-400 drop-shadow-[0_0_28px_rgba(16,185,129,0.55)]" />
        </div>
        <h1 className="text-3xl font-bold text-white mb-1 tracking-tight">Welcome to</h1>
        <h2 className="text-3xl font-bold mb-6 tracking-tight bg-gradient-to-r from-emerald-400 to-teal-400 bg-clip-text text-transparent">
          Sims 4 Mod Manager
        </h2>
        <p className="text-gray-400 mb-8 leading-relaxed">
          To get started, select your Sims 4 <strong className="text-gray-200">Mods</strong> folder.
          This is usually located at:
          <br />
          <code className="text-xs text-emerald-300 bg-white/5 border border-white/10 px-2 py-1 rounded-md mt-2 inline-block">
            Documents/Electronic Arts/The Sims 4/Mods
          </code>
        </p>

        <button
          onClick={handleSelect}
          disabled={loading}
          className="btn-primary w-full py-3 px-6 text-lg"
        >
          {loading ? 'Opening…' : <><FolderOpen size={20} weight="fill" /> Select Mods Folder</>}
        </button>

        {error && (
          <p className="mt-4 banner-error">Error: {error}</p>
        )}
      </div>
    </div>
  )
}
