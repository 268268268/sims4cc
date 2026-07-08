import { useState, useEffect } from 'react'
import { Package, Scroll, Image as ImageIcon, House, FileText, Paperclip, Folder, FolderOpen, Fire, Trash } from '@phosphor-icons/react'
import Modal from './Modal'
import { formatBytes, formatDate } from '../lib/format'

const TYPE_LABEL = { package: '.package', ts4script: '.ts4script', archive: '.zip', unknown: '?' }

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="240"><rect width="100%" height="100%" fill="#0c1a12"/><text x="50%" y="50%" font-size="80" text-anchor="middle" dy=".35em" fill="#1f6a4d">&#9670;</text></svg>'
  )

function FileIcon({ ext, ...props }) {
  if (ext === '.package') return <Package {...props} />
  if (ext === '.ts4script') return <Scroll {...props} />
  if (/\.(png|jpe?g|webp|gif)$/.test(ext)) return <ImageIcon {...props} />
  if (/\.(trayitem|householdbinary|sgi|blueprint|room|bpi|hhi)$/.test(ext)) return <House {...props} />
  if (/\.(cfg|ini|txt|md)$/.test(ext)) return <FileText {...props} />
  return <Paperclip {...props} />
}

export default function LocalModDetail({ mod, catalogMeta, cfMatch, onOpenCf, onToggle, onDelete, onClose }) {
  const [imgUrl, setImgUrl] = useState(catalogMeta?.imageUrl || null)
  const [info, setInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    // resolve the local thumbnail if there's no remote catalog image
    if (!catalogMeta?.imageUrl && mod.thumbnail?.path) {
      window.api.getImageUrl(mod.thumbnail.path).then(u => { if (!cancelled) setImgUrl(u) })
    }
    window.api.inspectLocalMod(mod.filePath).then(res => {
      if (!cancelled) { setInfo(res); setLoading(false) }
    }).catch(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [mod.filePath, mod.thumbnail?.path, catalogMeta?.imageUrl])

  const creatorName = catalogMeta?.creatorName
  const isArchive = mod.type === 'archive'

  return (
    <Modal onClose={onClose} maxWidth="max-w-2xl">
      <div className="p-6 flex flex-col gap-5">
        <div className="flex gap-4">
          <img
            src={imgUrl || PLACEHOLDER}
            alt={mod.name}
            className="w-28 h-28 rounded-xl object-cover bg-[#181b2a] border border-white/10 shrink-0"
            onError={() => setImgUrl(null)}
          />
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-white leading-tight break-words">{mod.name}</h2>
            {(creatorName || mod.author) && (
              <p className="text-emerald-400 text-sm mt-0.5">{creatorName || mod.author}</p>
            )}
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="badge bg-white/10 text-gray-200 font-mono">{TYPE_LABEL[mod.type]}</span>
              {!isArchive && (
                <span className={`badge ${mod.enabled ? 'bg-emerald-800/50 text-emerald-300' : 'bg-red-900/50 text-red-300'}`}>
                  {mod.enabled ? 'enabled' : 'disabled'}
                </span>
              )}
              {mod.kinds?.map(k => (
                <span key={k} className="badge bg-emerald-600/20 text-emerald-200">{k}</span>
              ))}
              <span className="text-gray-500 text-xs">{formatBytes(mod.size)}</span>
              {mod.modifiedAt && <span className="text-gray-600 text-xs">· {formatDate(mod.modifiedAt)}</span>}
              {mod.dateAdded && <span className="text-gray-600 text-xs">· added {formatDate(mod.dateAdded)}</span>}
            </div>
          </div>
        </div>

        {catalogMeta?.tags?.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {catalogMeta.tags.map(t => (
              <span key={t} className="badge bg-white/5 text-gray-400">{t}</span>
            ))}
          </div>
        )}

        {/* Package contents */}
        {info?.packageContents && (
          <div>
            <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-2">
              Package contents · {info.packageContents.total} resources
            </p>
            <div className="flex flex-wrap gap-1.5">
              {info.packageContents.types.map(t => (
                <span key={t.label} className="badge bg-emerald-600/20 text-emerald-200">
                  {t.label} ×{t.count}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Files in this mod's folder */}
        <div>
          <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-2">
            Files {info?.files?.length ? `· ${info.files.length}` : ''}
          </p>
          {loading ? (
            <div className="space-y-1.5">
              {Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-6 skeleton rounded" />)}
            </div>
          ) : info?.files?.length ? (
            <div className="max-h-48 overflow-y-auto rounded-lg border border-white/5 divide-y divide-white/5">
              {info.files.map(f => (
                <div
                  key={f.name}
                  className={`flex items-center gap-2 px-3 py-1.5 text-xs ${f.isSelf ? 'bg-emerald-600/10' : ''}`}
                >
                  <FileIcon ext={f.ext} size={14} weight="regular" className="text-gray-400 shrink-0" />
                  <span className="text-gray-300 truncate flex-1" title={f.name}>{f.name}</span>
                  <span className="text-gray-600 shrink-0">{formatBytes(f.size)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600 text-xs">{info?.error || 'No sibling files.'}</p>
          )}
        </div>

        <p className="text-gray-600 text-xs break-all flex items-center gap-1.5" title={mod.filePath}>
          <Folder size={13} weight="fill" className="shrink-0" /> {mod.relativePath}
        </p>

        {/* Actions */}
        <div className="flex items-center gap-2.5 pt-1 flex-wrap">
          {!isArchive && (
            <button
              onClick={() => { onToggle?.(mod); onClose() }}
              className={`${mod.enabled ? 'btn-danger' : 'btn-success'} px-4 py-2 text-sm`}
            >
              {mod.enabled ? 'Disable' : 'Enable'}
            </button>
          )}
          <button
            onClick={() => window.api.showItemInFolder(mod.filePath)}
            className="btn-ghost px-4 py-2 text-sm"
          >
            <FolderOpen size={16} weight="fill" /> Reveal in folder
          </button>
          {cfMatch && (
            <button
              onClick={() => { onClose(); onOpenCf?.(cfMatch) }}
              className="btn-ghost px-4 py-2 text-sm"
            >
              <Fire size={16} weight="fill" /> View on CurseForge
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(mod)}
              className="btn-ghost px-4 py-2 text-sm text-red-300 hover:text-red-200"
              title="Move to Recycle Bin"
            >
              <Trash size={16} weight="regular" /> Delete
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
