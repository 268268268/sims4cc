import { ArrowCircleUp, X, Sparkle } from '@phosphor-icons/react'
import { useT } from '../lib/i18n'
import { useAppUpdate } from '../context/UpdateContext'

export default function UpdateBanner({ onNavigate }) {
  const { t } = useT()
  const { showBanner, updateInfo, dismissBanner } = useAppUpdate()

  if (!showBanner || !updateInfo) return null

  const version = updateInfo.latestVersion || 'latest'

  const handleOpen = () => {
    dismissBanner()
    onNavigate?.('settings')
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-md animate-in fade-in slide-in-from-bottom-4 duration-300">
      <div className="bg-[#121815]/95 backdrop-blur-md border border-emerald-500/40 shadow-2xl shadow-emerald-950/50 rounded-2xl p-4 flex items-center gap-3.5 text-white">
        <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center shrink-0 text-emerald-400">
          <ArrowCircleUp size={24} weight="duotone" />
        </div>

        <div className="flex-1 min-w-0 pr-1">
          <div className="flex items-center gap-1.5 font-semibold text-sm text-emerald-300">
            <Sparkle size={14} weight="fill" className="text-emerald-400 shrink-0" />
            <span>{t('updates.bannerNotice', { version: `v${version}` })}</span>
          </div>
          <p className="text-xs text-gray-400 truncate mt-0.5">
            {updateInfo.releaseName || `Sims 4 Mod Manager ${version}`}
          </p>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={handleOpen}
            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold shadow-sm transition-all duration-150 cursor-pointer"
          >
            {t('updates.bannerAction')}
          </button>
          <button
            onClick={dismissBanner}
            title={t('updates.bannerDismiss')}
            className="p-1.5 text-gray-400 hover:text-gray-200 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      </div>
    </div>
  )
}
