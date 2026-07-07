import { useState } from 'react'
import Modal from './Modal'
import Lightbox from './Lightbox'
import { formatRelative } from '../lib/format'

const TYPE_META = {
  patreon: { icon: '🧡', label: 'Patreon', badge: 'bg-orange-600/30 text-orange-200' },
  pinterest: { icon: '📌', label: 'Pinterest', badge: 'bg-red-600/30 text-red-200' },
  tumblr: { icon: '📝', label: 'Tumblr', badge: 'bg-sky-600/30 text-sky-200' },
  modthesims: { icon: '🏛', label: 'ModTheSims', badge: 'bg-emerald-600/30 text-emerald-200' }
}

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect width="100%" height="100%" fill="#1f2937"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dy=".35em" fill="#4b5563">🌐</text></svg>'
  )

/** In-app preview card for a Discover item (no forced redirect). */
export default function DiscoverDetail({ item, onClose, renderDownload }) {
  const [lightbox, setLightbox] = useState(false)
  const meta = TYPE_META[item.sourceType] ?? { icon: '🌐', label: item.sourceType, badge: 'bg-gray-700 text-gray-300' }
  const banner = item.imageUrl || PLACEHOLDER
  const downloads = item.downloads ?? []

  return (
    <>
      <Modal onClose={onClose} maxWidth="max-w-2xl">
        <div className="relative">
          <img
            src={banner}
            alt={item.title}
            className={`w-full max-h-80 object-cover bg-[#181b2a] ${item.imageUrl ? 'cursor-zoom-in' : ''}`}
            onClick={() => item.imageUrl && setLightbox(true)}
            onError={(e) => { e.currentTarget.src = PLACEHOLDER }}
          />
          <span className={`absolute top-3 left-3 badge ${meta.badge} backdrop-blur-sm`}>
            {meta.icon} {meta.label}
          </span>
          {item.locked ? (
            <span className="absolute top-3 right-12 badge bg-black/70 text-amber-300 backdrop-blur-sm">🔒 patrons</span>
          ) : downloads.length > 0 && (
            <span className="absolute top-3 right-12 badge bg-emerald-600/80 text-white backdrop-blur-sm">🆓 free</span>
          )}
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">{item.title}</h2>
            <div className="flex items-center gap-2 mt-1 text-sm">
              {item.author && <span className="text-violet-400">{item.author}</span>}
              {item.date && <span className="text-gray-600">· {formatRelative(item.date)}</span>}
            </div>
          </div>

          {item.summary && (
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{item.summary}</p>
          )}

          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map(t => <span key={t} className="badge bg-white/5 text-gray-400">#{t}</span>)}
            </div>
          )}

          {downloads.length > 0 && (
            <div>
              <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-2">
                {downloads.length} file{downloads.length !== 1 ? 's' : ''}
              </p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto rounded-lg border border-white/5 divide-y divide-white/5">
                {downloads.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    <span>{/\.zip$/i.test(d.name) ? '🗜' : '📦'}</span>
                    <span className="text-gray-300 truncate" title={d.name}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.locked && (
            <p className="banner-warn">
              🔒 This is a patron-only post. Connect your Patreon account in Settings (if you back this
              creator) to download it, or open the original to view on Patreon.
            </p>
          )}

          <div className="flex items-center gap-3 pt-1 flex-wrap">
            {downloads.length > 0 && renderDownload?.(item)}
            <button onClick={() => window.api.openExternal(item.url)} className="btn-ghost px-4 py-2 text-sm">
              ↗ Open original
            </button>
          </div>
        </div>
      </Modal>

      {lightbox && item.imageUrl && (
        <Lightbox images={[{ url: item.imageUrl, title: item.title }]} index={0} onClose={() => setLightbox(false)} />
      )}
    </>
  )
}
