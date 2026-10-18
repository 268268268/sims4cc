import { useState, useEffect, useRef } from 'react'
import { DownloadSimple, ThumbsUp, HardDrives, CalendarBlank, GameController, ArrowUp, Check, Warning, ArrowSquareOut } from '@phosphor-icons/react'
import Modal from './Modal'
import Lightbox from './Lightbox'
import DownloadButton from './DownloadButton'
import { formatBytes, formatCount, formatDate } from '../lib/format'
import { pickLatestFile, RELEASE_TYPE } from '../lib/cfFile'
import { useT } from '../lib/i18n'
import { useDownloadQueue } from '../context/DownloadQueueContext'

const PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220"><rect width="100%" height="100%" fill="#0c1a12"/><text x="50%" y="50%" font-size="60" text-anchor="middle" dy=".35em" fill="#1f6a4d">&#9670;</text></svg>'
  )

function Stat({ Icon, label, value }) {
  if (!value) return null
  return (
    <div className="flex flex-col">
      <span className="text-gray-500 text-[11px] uppercase tracking-wide">{label}</span>
      <span className="text-gray-200 text-sm inline-flex items-center gap-1.5"><Icon size={15} weight="regular" className="text-emerald-400" /> {value}</span>
    </div>
  )
}

function DescriptionTab({ modId }) {
  const { t } = useT()
  const [state, setState] = useState({ loading: true, html: '', error: null })
  const boxRef = useRef(null)

  useEffect(() => {
    let cancelled = false
    window.api.getCurseForgeDescription(modId).then(res => {
      if (!cancelled) setState({ loading: false, html: res?.html ?? '', error: res?.error ?? null })
    }).catch(err => {
      if (!cancelled) setState({ loading: false, html: '', error: err.message })
    })
    return () => { cancelled = true }
  }, [modId])

  // links inside the sanitized HTML must open externally, never navigate the app
  const onClick = (e) => {
    const a = e.target.closest?.('a')
    if (a?.href) {
      e.preventDefault()
      window.api.openExternal(a.href)
    }
  }

  if (state.loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-4 skeleton rounded" />)}
      </div>
    )
  }
  if (state.error) return <p className="text-red-400 text-sm flex items-center gap-1.5"><Warning size={15} weight="fill" /> {state.error}</p>
  if (!state.html) return <p className="text-gray-600 text-sm">{t('curseforge.noDescription')}</p>

  return (
    <div
      ref={boxRef}
      onClick={onClick}
      className="cf-description max-h-96 overflow-y-auto text-sm text-gray-300 leading-relaxed pr-1"
      dangerouslySetInnerHTML={{ __html: state.html }}
    />
  )
}

export default function CurseForgeModDetail({ mod, installed, hasUpdate, onInstalled, onClose, onOpenAuthor }) {
  const { t } = useT()
  const { bypassRestricted } = useDownloadQueue()
  const isRestricted = mod?.allowModDistribution === false
  const [lightboxIndex, setLightboxIndex] = useState(null)
  const [tab, setTab] = useState('overview') // overview | description
  const banner = mod?.logo?.url || mod?.logo?.thumbnailUrl || PLACEHOLDER
  const authors = mod?.authors?.length ? mod.authors : null
  const file = pickLatestFile(mod)
  const size = formatBytes(file?.fileLength)
  const downloads = formatCount(mod?.downloadCount)
  const thumbs = mod?.thumbsUpCount > 0 ? formatCount(mod.thumbsUpCount) : null
  const updated = formatDate(mod?.dateModified)
  const gameVersion = file?.gameVersions?.find(v => /^\d/.test(v)) || file?.gameVersions?.[0]
  const release = RELEASE_TYPE[file?.releaseType]
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
            {release && (
              <span className={`badge ${release.cls} shrink-0`} title={release.title}>{release.label}</span>
            )}
            {hasUpdate ? (
              <span className="badge bg-amber-500/90 text-black font-semibold shrink-0"><ArrowUp size={11} weight="bold" /> {t('curseforge.updateAvailable')}</span>
            ) : installed && (
              <span className="badge bg-emerald-600/90 text-white shrink-0"><Check size={11} weight="bold" /> {t('curseforge.installedBadge')}</span>
            )}
          </div>
          <p className="text-emerald-400 text-sm mt-1">
            {t('curseforge.by')}{' '}
            {authors ? authors.map((a, i) => (
              <span key={a.id ?? a.name}>
                {i > 0 && <span className="text-gray-600">, </span>}
                {a.id != null && onOpenAuthor ? (
                  <button onClick={() => onOpenAuthor(a)} className="hover:text-emerald-300 hover:underline">{a.name}</button>
                ) : a.name}
              </span>
            )) : t('curseforge.unknownAuthor')}
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Stat Icon={DownloadSimple} label={t('curseforge.statDownloads')} value={downloads} />
          <Stat Icon={ThumbsUp} label={t('curseforge.statLikes')} value={thumbs} />
          <Stat Icon={HardDrives} label={t('curseforge.fileSize')} value={size} />
          <Stat Icon={CalendarBlank} label={t('curseforge.statUpdated')} value={updated} />
          <Stat Icon={GameController} label={t('curseforge.statGameVer')} value={gameVersion} />
        </div>

        {/* Tabs */}
        <div className="flex items-center gap-1.5 border-b border-white/5 pb-2">
          <button onClick={() => setTab('overview')} className={`chip ${tab === 'overview' ? 'chip-active' : ''}`}>
            {t('curseforge.overview')}
          </button>
          <button onClick={() => setTab('description')} className={`chip ${tab === 'description' ? 'chip-active' : ''}`}>
            {t('curseforge.description')}
          </button>
        </div>

        {tab === 'description' && <DescriptionTab modId={mod.id} />}

        {tab === 'overview' && (
          <>
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
                <p className="text-gray-500 text-[11px] uppercase tracking-wide mb-2">{t('curseforge.screenshots')}</p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {screenshots.map((s, idx) => (
                    <img
                      key={s.id ?? s.url}
                      src={s.thumbnailUrl || s.url}
                      alt={s.title || 'screenshot'}
                      title={s.title || 'View full size'}
                      onClick={() => setLightboxIndex(idx)}
                      className="h-24 rounded-lg border border-white/10 object-cover cursor-pointer hover:border-emerald-500/60 hover:brightness-110 transition-all shrink-0"
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* Creator Restriction Warning Banner */}
        {isRestricted && (
          <div className={`p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 ${
            bypassRestricted
              ? 'bg-amber-950/30 border-amber-600/40 text-amber-200'
              : 'bg-white/[0.03] border-white/10 text-gray-300'
          }`}>
            <Warning size={16} weight="fill" className={`shrink-0 mt-0.5 ${bypassRestricted ? 'text-amber-400' : 'text-gray-400'}`} />
            <div className="flex-1">
              <p className={`font-semibold mb-0.5 ${bypassRestricted ? 'text-amber-300' : 'text-gray-200'}`}>
                {bypassRestricted ? t('curseforge.bypassWarningBadge') : t('curseforge.authorRestricted')}
              </p>
              <p className="opacity-90">
                {bypassRestricted
                  ? t('curseforge.bypassWarningNotice')
                  : t('curseforge.restrictedModalNotice')}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 pt-1">
          <DownloadButton
            mod={mod}
            installed={installed}
            mode={hasUpdate ? 'update' : 'download'}
            onInstalled={onInstalled}
            className="px-4 py-2 text-sm"
          />
          {websiteUrl && (!isRestricted || bypassRestricted) && (
            <button
              onClick={() => {
                window.api.startDownloadWatch?.({ id: mod.id, name: mod.name, latestFiles: mod.latestFiles })
                window.api.openExternal(websiteUrl)
              }}
              className="btn-ghost px-4 py-2 text-sm"
            >
              <ArrowSquareOut size={16} weight="bold" /> {t('curseforge.openOnCf')}
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
