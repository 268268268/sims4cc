import { useState } from 'react'
import {
  ArrowCircleUp,
  ArrowsClockwise,
  DownloadSimple,
  CheckCircle,
  CircleNotch,
  Sparkle,
  WarningOctagon,
  FileText
} from '@phosphor-icons/react'
import { useT } from '../lib/i18n'
import { useAppUpdate } from '../context/UpdateContext'
import { formatBytes, formatDate } from '../lib/format'

function ReleaseNotesView({ text }) {
  if (!text) return null
  const lines = text.split('\n')
  return (
    <div className="bg-black/40 border border-white/10 rounded-xl p-3.5 max-h-56 overflow-y-auto text-xs text-gray-300 space-y-1 custom-scrollbar">
      {lines.map((line, idx) => {
        const trimmed = line.trim()
        if (trimmed.startsWith('### ')) {
          return <h4 key={idx} className="font-semibold text-gray-200 mt-2 text-xs">{trimmed.replace(/^###\s+/, '')}</h4>
        }
        if (trimmed.startsWith('## ')) {
          return <h3 key={idx} className="font-bold text-emerald-400 mt-2 text-sm">{trimmed.replace(/^##\s+/, '')}</h3>
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 text-gray-300">
              <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
              <span>{trimmed.replace(/^[-*]\s+/, '')}</span>
            </div>
          )
        }
        if (trimmed === '') {
          return <div key={idx} className="h-0.5" />
        }
        return <p key={idx} className="leading-relaxed text-gray-400">{trimmed}</p>
      })}
    </div>
  )
}

export default function AppUpdatesSection() {
  const { t } = useT()
  const {
    currentVersion,
    updateInfo,
    hasUpdate,
    checking,
    status,
    progress,
    error,
    checkForUpdate,
    downloadAndInstall,
    restartApp
  } = useAppUpdate()

  const [showNotes, setShowNotes] = useState(true)
  const isBusy = status === 'downloading' || status === 'extracting' || status === 'installing'

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {t('updates.title')}
      </h3>

      <div className="card p-5 space-y-4">
        {/* Top Info Header */}
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
              hasUpdate
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-400'
                : 'bg-white/5 border-white/10 text-gray-400'
            }`}>
              {hasUpdate ? <ArrowCircleUp size={24} weight="duotone" /> : <Sparkle size={22} weight="regular" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-200">{t('updates.currentVersion')}:</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-white/10 text-gray-200 border border-white/10">
                  v{currentVersion || '2.0.1'}
                </span>
                {hasUpdate && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 animate-pulse">
                    {t('updates.badgeText')}
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {hasUpdate
                  ? t('updates.updateAvailable', { version: `v${updateInfo?.latestVersion}` })
                  : t('updates.subtitle')}
              </p>
            </div>
          </div>

          <button
            onClick={() => checkForUpdate(true)}
            disabled={checking || isBusy}
            className="btn-ghost px-3.5 py-2 text-xs flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {checking ? (
              <>
                <CircleNotch size={14} weight="bold" className="animate-spin text-emerald-400" />
                <span>{t('updates.checking')}</span>
              </>
            ) : (
              <>
                <ArrowsClockwise size={14} weight="bold" />
                <span>{t('updates.checkUpdates')}</span>
              </>
            )}
          </button>
        </div>

        {/* Status: Up to date (when checked and no update) */}
        {!hasUpdate && !checking && updateInfo && (
          <div className="flex items-center gap-2 text-xs text-emerald-400/90 bg-emerald-950/30 border border-emerald-800/40 rounded-xl px-3.5 py-2.5">
            <CheckCircle size={16} weight="fill" className="shrink-0" />
            <span>{t('updates.upToDateDesc', { version: currentVersion || '2.0.1' })}</span>
          </div>
        )}

        {/* Update Available Box */}
        {hasUpdate && updateInfo && (
          <div className="border border-emerald-500/30 bg-emerald-950/20 rounded-xl p-4 space-y-3.5">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="text-sm font-semibold text-emerald-300 flex items-center gap-1.5">
                  <Sparkle size={15} weight="fill" className="text-emerald-400" />
                  <span>{updateInfo.releaseName || `Sims 4 CC Manager v${updateInfo.latestVersion}`}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                  {updateInfo.assetSize > 0 && (
                    <span>{t('updates.fileSize', { size: formatBytes(updateInfo.assetSize) })}</span>
                  )}
                  {updateInfo.publishedAt && (
                    <span>{t('updates.publishedAt', { date: formatDate(updateInfo.publishedAt) })}</span>
                  )}
                </div>
              </div>

              {updateInfo.releaseNotes && (
                <button
                  onClick={() => setShowNotes(v => !v)}
                  className="text-xs text-gray-400 hover:text-emerald-300 flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <FileText size={14} />
                  <span>{showNotes ? t('common.hide') : t('common.show')} {t('updates.releaseNotes')}</span>
                </button>
              )}
            </div>

            {/* Release notes viewer */}
            {showNotes && updateInfo.releaseNotes && (
              <ReleaseNotesView text={updateInfo.releaseNotes} />
            )}

            {/* Download Progress Bar */}
            {isBusy && (
              <div className="space-y-1.5 pt-1">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-300 flex items-center gap-2">
                    <CircleNotch size={13} weight="bold" className="animate-spin text-emerald-400" />
                    {status === 'downloading' && (
                      progress.total > 0
                        ? t('updates.downloadingProgress', {
                            percent: progress.percent,
                            downloaded: formatBytes(progress.downloaded),
                            total: formatBytes(progress.total)
                          })
                        : `${t('updates.downloading')} ${progress.percent}%`
                    )}
                    {status === 'extracting' && t('updates.extracting')}
                    {status === 'installing' && t('updates.installing')}
                  </span>
                  <span className="font-mono text-emerald-400 font-semibold">{progress.percent}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-white/10 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 transition-all duration-200"
                    style={{ width: `${progress.percent}%` }}
                  />
                </div>
              </div>
            )}

            {/* Ready to Restart Box */}
            {status === 'ready' && (
              <div className="p-3.5 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <CheckCircle size={22} weight="fill" className="text-emerald-400 shrink-0" />
                  <div>
                    <div className="text-sm font-semibold text-emerald-200">{t('updates.readyToRestart')}</div>
                    <div className="text-xs text-gray-300">{t('updates.readyDesc')}</div>
                  </div>
                </div>
                <button
                  onClick={restartApp}
                  className="btn-primary px-4 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer shadow-lg shadow-emerald-950"
                >
                  <ArrowsClockwise size={15} weight="bold" />
                  <span>{t('updates.restartNow')}</span>
                </button>
              </div>
            )}

            {/* Download & Install Button (when not downloading or ready) */}
            {status !== 'ready' && !isBusy && (
              <div className="pt-1">
                <button
                  onClick={downloadAndInstall}
                  className="btn-primary px-4 py-2 text-xs font-semibold flex items-center gap-2 cursor-pointer"
                >
                  <DownloadSimple size={15} weight="bold" />
                  <span>{t('updates.downloadAndInstall')}</span>
                </button>
              </div>
            )}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/40 border border-red-800/50 rounded-xl px-3.5 py-2.5">
            <WarningOctagon size={16} weight="fill" className="shrink-0 text-red-400" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </section>
  )
}
