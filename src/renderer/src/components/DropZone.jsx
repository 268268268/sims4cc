import { useState, useEffect } from 'react'
import { markChanged } from '../lib/sessionActivity'

/**
 * Whole-window drag-and-drop install target. Mounted once in App; shows an
 * overlay while files hover, imports on drop, and reports a per-file summary.
 */
export default function DropZone() {
  const [depth, setDepth] = useState(0)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null) // { results } | { error }

  useEffect(() => {
    const hasFiles = (e) => [...(e.dataTransfer?.types ?? [])].includes('Files')

    const onDragEnter = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDepth(d => d + 1)
    }
    const onDragOver = (e) => {
      if (!hasFiles(e)) return
      e.preventDefault() // required, or Electron navigates to the file
      e.dataTransfer.dropEffect = 'copy'
    }
    const onDragLeave = (e) => {
      if (!hasFiles(e)) return
      setDepth(d => Math.max(0, d - 1))
    }
    const onDrop = async (e) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      setDepth(0)
      const paths = [...e.dataTransfer.files]
        .map(f => window.api.getPathForFile(f))
        .filter(Boolean)
      if (!paths.length) return
      setBusy(true)
      try {
        const res = await window.api.importFiles(paths)
        setReport(res)
        if (res?.ok) {
          markChanged()
          window.dispatchEvent(new CustomEvent('local-mods-changed'))
        }
      } catch (err) {
        setReport({ ok: false, results: [], error: err.message })
      } finally {
        setBusy(false)
      }
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <>
      {(depth > 0 || busy) && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm pointer-events-none">
          <div className="border-2 border-dashed border-violet-500/70 rounded-2xl px-14 py-10 bg-[#12141f]/80 text-center">
            <div className="text-5xl mb-3">{busy ? '⏳' : '📥'}</div>
            <p className="text-white font-semibold text-lg">
              {busy ? 'Installing…' : 'Drop mods to install'}
            </p>
            <p className="text-gray-400 text-sm mt-1">.zip, .package, .ts4script, tray files</p>
          </div>
        </div>
      )}

      {report && (
        <div className="fixed bottom-4 right-4 z-40 w-96 max-h-72 overflow-y-auto card p-4 fade-in-up">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white font-semibold text-sm">
              {report.ok ? '✅ Install finished' : '⚠️ Install failed'}
            </p>
            <button onClick={() => setReport(null)} className="text-gray-500 hover:text-white text-xs">✕</button>
          </div>
          {report.error && <p className="text-red-400 text-xs mb-1">{report.error}</p>}
          <div className="flex flex-col gap-1">
            {(report.results ?? []).map((r, i) => (
              <div key={i} className="text-xs flex items-start gap-1.5">
                <span>{r.ok ? '✓' : '✗'}</span>
                <span className={`${r.ok ? 'text-gray-300' : 'text-red-400'} break-all`}>
                  {r.source.split(/[\\/]/).pop()}
                  {r.trayFiles?.length > 0 && <span className="text-amber-300"> · {r.trayFiles.length} → Tray</span>}
                  {r.note && <span className="text-gray-500"> · {r.note}</span>}
                  {r.error && <span> — {r.error}</span>}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  )
}
