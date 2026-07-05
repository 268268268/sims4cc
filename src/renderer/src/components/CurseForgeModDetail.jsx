import { useState } from 'react'
import Modal from './Modal'
import Lightbox from './Lightbox'
import DownloadButton from './DownloadButton'
import { formatBytes, formatCount, formatDate } from '../lib/format'

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dy=".35em" fill="#4b5563">📦</text></svg>'
  )

function Stat({ icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex flex-col">
      <span className="text-gray-500 text-[11px] uppercase tracking-wide">{label}</span>
      <span className="text-gray-200 text-sm">{icon} {value}</span>
    </div>
  )
}

export default function CurseForgeModDetail({ mod, installed, onInstalled, onClose }) {
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const banner = mod?.logo?.url || mod?.logo?.thumbnailUrl || PLACEHOLDER
  const author = mod?.authors?.[0]?.name || 'Unknown'
  const file = mod?.latestFiles?.[0]
  const size = formatBytes(file?.fileLength)
  const downloads = formatCount(mod?.downloadCount)
  const updated = formatDate(mod?.dateModified)
  const gameVersion = file?.gameVersions?.find(v => /^\d/.test(v)) || file?.gameVersions?.[0]
  const categories = mod?.categories ?? []
  const screenshots = (mod?.screenshots ?? []).slice(0, 20)
  const websiteUrl = mod?.links?.websiteUrl

  return (
    <>
    <Modal onClose={onClose} maxWidth="max-w-3xl">
      <img src={banner} alt={mod.name} className="w-full h-52 object-cover bg-[#181b2a]" />

      <div className="p-6 flex flex-col gap-5">
        <div>
          <div className="flex items-start gap-3 flex-wrap">
            <h2 className="text-xl font-bold text-white leading-tight flex-1">{mod.name}</h2>
            {installed && (
              <span className="badge bg-emerald-600/90 text-white shrink-0">✓ Installed</span>
            )}
          </div>
          <p className="text-violet-400 text-sm mt-1">by {author}</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon="⬇" label="Downloads" value={downloads} />
          <Stat icon="💾" label="File size" value={size} />
          <Stat icon="🗓" label="Updated" value={updated} />
          <Stat icon="🎮" label="Game ver." value={gameVersion} />
        </div>

        {mod.summary && (
          <p className="text-gray-300 text-sm leading-relaxed">{mod.summary}</p>
        )}

        {categories.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {categories.map(c => (
              <span key={c.id ?? c.name} className="chip !cursor-default">
                {c.iconUrl && <img src={c.iconUrl} alt="" className="w-3.5 h-3.5" />}
                {c.name}
              </span>
            ))}
          </div>
        )}

        {screenshots.length > 0 && (
          <div>
            <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-2">Screenshots</p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {screenshots.map((s, idx) => (
                <img
                  key={s.id ?? s.url}
                  src={s.thumbnailUrl || s.url}
                  alt={s.title || 'screenshot'}
                  title={s.title || 'View full size'}
                  onClick={() => setLightboxIndex(idx)}
                  className="h-24 rounded-lg border border-white/10 object-cover cursor-pointer hover:border-violet-500/60 hover:brightness-110 transition-all shrink-0"
                />
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <DownloadButton
            mod={mod}
            installed={installed}
            onInstalled={onInstalled}
            className="px-4 py-2 text-sm"
          />
          {websiteUrl && (
            <button
              onClick={() => window.api.openExternal(websiteUrl)}
              className="btn-ghost px-4 py-2 text-sm"
            >
              🔗 Open on CurseForge
            </button>
          )}
        </div>
      </div>
    </Modal>

    {lightboxIndex !== null && (
      <Lightbox
        images={screenshots}
        index={lightboxIndex}
        onClose={() => setLightboxIndex(null)}
      />
    )}
    </>
  )
}
