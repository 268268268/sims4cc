import { useState, useEffect } from 'react'
import { DownloadSimple, CircleNotch, CheckCircle, WarningCircle, Check, X } from '@phosphor-icons/react'
import { markChanged } from '../lib/sessionActivity'
import { useT } from '../lib/i18n'

/**
 * Whole-window drag-and-drop install target. Mounted once in App; shows an
 * overlay while files hover, imports on drop, and reports a per-file summary.
 */
export default function DropZone() {
  const { t } = useT()
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
          <div className="border-2 border-dashed border-emerald-500/70 rounded-2xl px-14 py-10 glass text-center">
            <div className="flex justify-center mb-3 text-emerald-400">
              {busy
                ? <CircleNotch size={52} weight="bold" className="animate-spin" />
                : <DownloadSimple size={52} weight="regular" />}
            </div>
            <p className="text-white font-semibold text-lg">
              {busy ? t('dropzone.installing') : t('dropzone.dropTitle')}
            </p>
            <p className="text-gray-400 text-sm mt-1">{t('dropzone.dropHint')}</p>
          </div>
        </div>
      )}

      {report && (
        <div className="fixed bottom-4 right-4 z-40 w-96 max-h-72 overflow-y-auto card p-4 fade-in-up">
          <div className="flex items-center justify-between mb-2">
            <p className="text-white font-semibold text-sm flex items-center gap-1.5">
              {report.ok
                ? <CheckCircle size={18} weight="fill" className="text-emerald-400" />
                : <WarningCircle size={18} weight="fill" className="text-amber-400" />}
              {report.ok ? t('dropzone.installFinished') : t('dropzone.installFailed')}
            </p>
            <button onClick={() => setReport(null)} className="text-gray-500 hover:text-white"><X size={14} weight="bold" /></button>
          </div>
          {report.error && <p className="text-red-400 text-xs mb-1">{report.error}</p>}
          <div className="flex flex-col gap-1">
            {(report.results ?? []).map((r, i) => (
              <div key={i} className="text-xs flex items-start gap-1.5">
                <span className="mt-0.5 shrink-0">{r.ok
                  ? <Check size={13} weight="bold" className="text-emerald-400" />
                  : <X size={13} weight="bold" className="text-red-400" />}</span>
                <span className={`${r.ok ? 'text-gray-300' : 'text-red-400'} break-all`}>
                  {r.source.split(/[\\/]/).pop()}
                  {r.trayFiles?.length > 0 && <span className="text-amber-300"> · {t('dropzone.trayCount', { count: r.trayFiles.length })}</span>}
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
