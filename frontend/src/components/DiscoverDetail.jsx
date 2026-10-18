import { useState, useEffect, useMemo } from 'react'
import { HeartStraight, PushPin, NotePencil, Bank, Globe, LockSimple, Gift, Package, FileZip, ArrowUpRight, Lightning, CloudArrowDown } from '@phosphor-icons/react'
import Modal from './Modal'
import Lightbox from './Lightbox'
import { formatRelative } from '../lib/format'
import { isDownloadable } from '../lib/downloadable'
import { useT } from '../lib/i18n'

const TYPE_META = {
  patreon: { Icon: HeartStraight, label: 'Patreon', badge: 'bg-orange-600/30 text-orange-200' },
  pinterest: { Icon: PushPin, label: 'Pinterest', badge: 'bg-red-600/30 text-red-200' },
  tumblr: { Icon: NotePencil, label: 'Tumblr', badge: 'bg-sky-600/30 text-sky-200' },
  modthesims: { Icon: Bank, label: 'ModTheSims', badge: 'bg-emerald-600/30 text-emerald-200' },
  boosty: { Icon: Lightning, label: 'Boosty', badge: 'bg-amber-600/30 text-amber-200' },
  tsr: { Icon: Globe, label: 'The Sims Resource', badge: 'bg-pink-600/30 text-pink-200' },
  itch: { Icon: Globe, label: 'Itch.io', badge: 'bg-rose-600/30 text-rose-200' },
  itchio: { Icon: Globe, label: 'Itch.io', badge: 'bg-rose-600/30 text-rose-200' },
  github: { Icon: Globe, label: 'GitHub', badge: 'bg-purple-600/30 text-purple-200' },
  simfileshare: { Icon: CloudArrowDown, label: 'SimFileShare', badge: 'bg-teal-600/30 text-teal-200' },
  gdrive: { Icon: CloudArrowDown, label: 'Google Drive', badge: 'bg-blue-600/30 text-blue-200' },
  mediafire: { Icon: CloudArrowDown, label: 'MediaFire', badge: 'bg-cyan-600/30 text-cyan-200' },
  mega: { Icon: CloudArrowDown, label: 'Mega.nz', badge: 'bg-red-600/30 text-red-200' },
  dropbox: { Icon: CloudArrowDown, label: 'Dropbox', badge: 'bg-indigo-600/30 text-indigo-200' },
  curseforge: { Icon: Globe, label: 'CurseForge', badge: 'bg-orange-600/30 text-orange-200' }
}

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect width="100%" height="100%" fill="#0c1a12"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dy=".35em" fill="#1f6a4d">&#9670;</text></svg>'
  )

/** In-app preview card for a Discover item (no forced redirect). */
export default function DiscoverDetail({ item, onClose, renderDownload, onOpenAuthor }) {
  const { t } = useT()
  const [lightbox, setLightbox] = useState(null) // gallery index | null
  const [mts, setMts] = useState(null) // { downloads, images } — fetched on open for MTS/link items
  const [bannerIdx, setBannerIdx] = useState(0)
  const meta = TYPE_META[item.sourceType] ?? { Icon: Globe, label: item.sourceType, badge: 'bg-gray-700 text-gray-300' }
  const MetaIcon = meta.Icon
  const downloads = item.downloads?.length ? item.downloads : (mts?.downloads ?? [])

  // MTS/Tumblr/Patreon/Boosty cards with external links resolve their file list when the modal opens
  useEffect(() => {
    let dead = false
    setMts(null)
    setBannerIdx(0)
    if (item.sourceType === 'modthesims' && item.url) {
      window.api.getMtsDetail?.(item.url).then(r => { if (!dead && r?.ok) setMts(r) })
    } else if (!item.downloads?.length && item.links?.length) {
      window.api.getTumblrDetail?.(item.links).then(r => { if (!dead && r?.ok) setMts(r) })
    }
    return () => { dead = true }
  }, [item])

  const gallery = useMemo(() => {
    const raw = [
      ...(item.images ?? []),
      ...(mts?.images ?? []),
      ...(item.imageUrl ? [item.imageUrl] : [])
    ]
    const seen = new Set()
    const out = []
    for (const u of raw) {
      if (u && !seen.has(u)) {
        seen.add(u)
        out.push({ url: u, title: item.title })
      }
    }
    return out
  }, [item, mts])

  const bannerCandidates = useMemo(() => {
    const list = [
      ...gallery.map(g => g.url),
      item.imageUrl,
      item.avatarUrl
    ].filter(Boolean)
    return [...new Set(list)]
  }, [gallery, item])

  const banner = bannerCandidates[bannerIdx] || PLACEHOLDER

  return (
    <>
      <Modal onClose={onClose} maxWidth="max-w-2xl">
        <div className="relative">
          <img
            src={banner}
            alt={item.title}
            referrerPolicy="no-referrer"
            className={`w-full max-h-80 object-cover bg-[#181b2a] ${gallery.length ? 'cursor-zoom-in' : ''}`}
            onClick={() => gallery.length && setLightbox(0)}
            onError={(e) => {
              if (bannerIdx + 1 < bannerCandidates.length) {
                setBannerIdx(i => i + 1)
              } else {
                e.currentTarget.src = PLACEHOLDER
              }
            }}
          />
          <span className={`absolute top-3 left-3 badge ${meta.badge} backdrop-blur-sm`}>
            <MetaIcon size={12} weight="fill" /> {meta.label}
          </span>
          {item.locked ? (
            <span className="absolute top-3 right-12 badge bg-black/70 text-amber-300 backdrop-blur-sm"><LockSimple size={11} weight="fill" /> {t('discover.patronsOnly')}</span>
          ) : isDownloadable(item) && (
            <span className="absolute top-3 right-12 badge bg-emerald-600/80 text-white backdrop-blur-sm"><Gift size={11} weight="fill" /> {t('discover.freeBadge')}</span>
          )}
        </div>

        <div className="p-6 flex flex-col gap-4">
          <div>
            <h2 className="text-xl font-bold text-white leading-tight">{item.title}</h2>
            <div className="flex items-center gap-2 mt-1.5 text-sm">
              {item.avatarUrl && (
                <img
                  src={item.avatarUrl}
                  alt={item.author || ''}
                  referrerPolicy="no-referrer"
                  className="w-5 h-5 rounded-full object-cover bg-[#181b2a] shrink-0"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              )}
              {item.author && (
                onOpenAuthor ? (
                  <button onClick={() => { onClose(); onOpenAuthor(item) }} className="text-emerald-400 hover:text-emerald-300 hover:underline font-medium">{item.author}</button>
                ) : <span className="text-emerald-400 font-medium">{item.author}</span>
              )}
              {item.date && <span className="text-gray-600">· {formatRelative(item.date)}</span>}
            </div>
          </div>

          {item.summary && (
            <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{item.summary}</p>
          )}

          {gallery.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {gallery.map((g, i) => (
                <img
                  key={g.url}
                  src={g.url}
                  alt={item.title}
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onClick={() => setLightbox(i)}
                  className="h-24 rounded-lg object-cover cursor-zoom-in shrink-0 bg-[#181b2a] border border-white/5 hover:border-emerald-500/50 transition-colors"
                  onError={(e) => { e.currentTarget.style.display = 'none' }}
                />
              ))}
            </div>
          )}

          {item.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {item.tags.map(t => <span key={t} className="badge bg-white/5 text-gray-400">#{t}</span>)}
            </div>
          )}

          {downloads.length > 0 && (
            <div>
              <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-2">
                {t('discover.filesCount', { count: downloads.length })}
              </p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto rounded-lg border border-white/5 divide-y divide-white/5">
                {downloads.map((d, i) => (
                  <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                    {/\.(zip|rar|7z)$/i.test(d.name)
                      ? <FileZip size={14} weight="regular" className="text-gray-400 shrink-0" />
                      : <Package size={14} weight="regular" className="text-gray-400 shrink-0" />}
                    <span className="text-gray-300 truncate" title={d.name}>{d.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {item.locked && (
            <p className="banner-warn flex items-start gap-2">
              <LockSimple size={14} weight="fill" className="shrink-0 mt-0.5" /> {t('discover.patronWarning')}
            </p>
          )}

          <div className="flex items-center gap-3 pt-1 flex-wrap">
            {isDownloadable(item) && renderDownload?.({ ...item, downloads })}
            {item.url && (
              <button onClick={() => window.api.openExternal(item.url)} className="btn-ghost px-4 py-2 text-sm">
                <ArrowUpRight size={16} weight="bold" /> {t('discover.openOriginal')}
              </button>
            )}
          </div>
        </div>
      </Modal>

      {lightbox != null && gallery.length > 0 && (
        <Lightbox images={gallery} index={lightbox} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}
