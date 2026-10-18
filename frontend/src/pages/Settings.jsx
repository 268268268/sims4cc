import { useState, useEffect } from 'react'
import { Eye, EyeSlash, Check, Globe, HeartStraight, PushPin, FolderOpen, Broom, Warning, Folder, Trash, CheckCircle, XCircle, Translate, Coffee, Copy, CurrencyCircleDollar, ShieldWarning, Palette } from '@phosphor-icons/react'
import { useT, LANG_OPTIONS } from '../lib/i18n'
import { useDownloadQueue } from '../context/DownloadQueueContext'
import { THEMES, THEME_CATEGORIES, getInitialTheme, setAppTheme } from '../lib/theme'
import AppUpdatesSection from '../components/AppUpdatesSection'

const KOFI_URL = 'https://ko-fi.com/sims4ccmanager'
const PAYPAL_EMAIL = 'feliks.pochta@gmail.com'

/** Optional "support the app" links. Nothing is gated — this is a plain thank-you. */
function SupportSection() {
  const { t } = useT()
  const [copied, setCopied] = useState(false)

  const copyEmail = async () => {
    try {
      await navigator.clipboard.writeText(PAYPAL_EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* clipboard unavailable — the address is on screen anyway */ }
  }

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {t('settings.support')}
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-4 leading-relaxed">{t('settings.supportHint')}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => window.api.openExternal(KOFI_URL)} className="btn-primary px-4 py-2 text-sm">
            <Coffee size={16} weight="fill" /> {t('settings.supportKofi')}
          </button>
          <button
            onClick={() => window.api.openExternal(`https://www.paypal.com/donate/?business=${encodeURIComponent(PAYPAL_EMAIL)}`)}
            className="btn-ghost px-4 py-2 text-sm"
          >
            <CurrencyCircleDollar size={16} weight="fill" /> {t('settings.supportPaypal')}
          </button>
        </div>
        <div className="mt-4 flex items-center gap-2 flex-wrap">
          <span className="text-xs text-gray-500">{t('settings.supportPaypalEmail')}</span>
          <code className="text-xs text-gray-300 font-mono select-all">{PAYPAL_EMAIL}</code>
          <button onClick={copyEmail} className="text-gray-500 hover:text-emerald-400" title={t('settings.supportCopy')}>
            {copied
              ? <Check size={13} weight="bold" className="text-emerald-400" />
              : <Copy size={13} weight="bold" />}
          </button>
        </div>
      </div>
    </section>
  )
}

function ThemeSection() {
  const { t, lang } = useT()
  const [currentTheme, setCurrentTheme] = useState(() => getInitialTheme())
  const [activeCategory, setActiveCategory] = useState('all')

  useEffect(() => {
    const onThemeChange = (e) => {
      if (e?.detail?.theme) {
        setCurrentTheme(e.detail.theme)
      }
    }
    window.addEventListener('theme-changed', onThemeChange)
    return () => window.removeEventListener('theme-changed', onThemeChange)
  }, [])

  const handleSelect = async (id) => {
    setCurrentTheme(id)
    await setAppTheme(id)
  }

  const filteredThemes = activeCategory === 'all'
    ? THEMES
    : THEMES.filter(th => th.category === activeCategory)

  return (
    <section className="mb-6 fade-in-up">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
          <Palette size={17} weight="fill" className="text-sky-400 shrink-0" />
          {t('settings.theme')}
        </h3>
        <span className="text-xs text-gray-400">
          {t('settings.themeSubtitle')}
        </span>
      </div>

      <div className="card p-5">
        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 flex-wrap mb-4 pb-3 border-b border-white/5">
          {THEME_CATEGORIES.map(cat => {
            const count = cat.id === 'all' ? THEMES.length : THEMES.filter(th => th.category === cat.id).length
            const isCatActive = activeCategory === cat.id
            const label = lang === 'ru' ? cat.labelRu : cat.labelEn
            return (
              <button
                key={cat.id}
                onClick={() => setActiveCategory(cat.id)}
                className={`chip ${isCatActive ? 'chip-active' : ''}`}
              >
                {label} ({count})
              </button>
            )
          })}
        </div>

        {/* Themes Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filteredThemes.map(th => {
            const isSelected = currentTheme === th.id
            const name = lang === 'ru' ? th.nameRu : th.name
            const desc = lang === 'ru' ? th.descRu : th.descEn

            return (
              <div
                key={th.id}
                onClick={() => handleSelect(th.id)}
                className={`p-3.5 rounded-xl border cursor-pointer transition-all flex flex-col justify-between gap-3 relative group ${
                  isSelected
                    ? 'bg-white/[0.08] border-sky-400 ring-1 ring-sky-400/80 shadow-lg shadow-black/40'
                    : 'bg-white/[0.03] border-white/10 hover:border-white/20 hover:bg-white/[0.05]'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="font-semibold text-sm text-white group-hover:text-white transition-colors">
                      {name}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {th.tag === 'default' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          {t('settings.themeDefaultBadge')}
                        </span>
                      )}
                      {th.tag === 'og' && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {t('settings.themeOgBadge')}
                        </span>
                      )}
                      {isSelected && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-white text-black flex items-center gap-1">
                          <Check size={11} weight="bold" /> {t('settings.themeActive')}
                        </span>
                      )}
                    </div>
                  </div>

                  <p className="text-gray-400 text-xs leading-relaxed line-clamp-2">
                    {desc}
                  </p>
                </div>

                {/* Color Swatch Dots */}
                <div className="flex items-center justify-between pt-2 border-t border-white/5">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: th.preview.accent }}
                      title="Accent"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: th.preview.accent2 }}
                      title="Secondary"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: th.preview.card }}
                      title="Card Background"
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm"
                      style={{ backgroundColor: th.preview.bg }}
                      title="App Background"
                    />
                  </div>

                  <span className={`text-[11px] font-medium transition-colors ${
                    isSelected ? 'text-sky-300' : 'text-gray-500 group-hover:text-gray-300'
                  }`}>
                    {isSelected ? '✓' : (lang === 'ru' ? 'Выбрать' : 'Select')}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

function LanguageSection() {
  const { t, pref, setLanguage } = useT()
  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {t('settings.language')}
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-3 leading-relaxed flex items-center gap-2">
          <Translate size={18} weight="fill" className="text-emerald-400 shrink-0" />
          {t('settings.languageHint')}
        </p>
        <div className="flex items-center gap-1.5 flex-wrap">
          {LANG_OPTIONS.map(opt => (
            <button
              key={opt.id}
              onClick={() => setLanguage(opt.id)}
              className={`chip ${pref === opt.id ? 'chip-active' : ''}`}
            >
              {opt.id === 'auto' ? t('settings.languageAuto') : opt.native}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function CurseForgeSettingsSection() {
  const { t } = useT()
  const { bypassRestricted, setBypassRestricted } = useDownloadQueue()
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState(null) // null | 'saving' | 'saved'

  useEffect(() => {
    window.api.getConfig().then(cfg => setKey(cfg?.curseForgeApiKey ?? ''))
  }, [])

  const onSave = async () => {
    setStatus('saving')
    try {
      await window.api.setConfig('curseForgeApiKey', key.trim() || null)
      setStatus('saved')
      setTimeout(() => setStatus(null), 2500)
    } catch {
      setStatus(null)
    }
  }

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {t('settings.apiKey')}
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-3 leading-relaxed">
          {t('settings.apiKeyHint')}{' '}
          <button
            onClick={() => window.api.openExternal('https://console.curseforge.com/')}
            className="text-emerald-300 underline hover:text-emerald-200"
          >
            console.curseforge.com
          </button>
        </p>
        <div className="flex items-center gap-2">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder="$2a$10$…"
            className="input flex-1 px-3 py-2 font-mono text-xs"
          />
          <button onClick={() => setShow(s => !s)} className="btn-ghost px-3 py-2 text-sm" title={show ? t('common.hide') : t('common.show')}>
            {show ? <EyeSlash size={16} weight="regular" /> : <Eye size={16} weight="regular" />}
          </button>
          <button onClick={onSave} disabled={status === 'saving'} className="btn-primary px-4 py-2 text-sm">
            {status === 'saving' ? t('common.saving') : status === 'saved' ? <><Check size={15} weight="bold" /> {t('common.saved')}</> : t('common.save')}
          </button>
        </div>

        {/* CurseForge Author Restrictions Bypass */}
        <div className="my-5 border-t border-white/5" />

        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1.5 flex-wrap">
              <ShieldWarning size={18} weight="fill" className={bypassRestricted ? 'text-amber-400' : 'text-emerald-400'} />
              <h4 className="text-sm font-semibold text-gray-200">
                {t('settings.curseForgeRestrictions')}
              </h4>
              <span className={`px-2 py-0.5 rounded text-[11px] font-medium border flex items-center gap-1 ${
                bypassRestricted
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {bypassRestricted ? <Warning size={12} weight="bold" /> : <CheckCircle size={12} weight="bold" />}
                {bypassRestricted ? t('settings.bypassActiveBadge') : t('settings.bypassDisabledBadge')}
              </span>
            </div>
            <p className="text-gray-400 text-xs leading-relaxed">
              {t('settings.bypassRestrictedDesc')}
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={bypassRestricted}
            onClick={() => setBypassRestricted(!bypassRestricted)}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none self-center ${
              bypassRestricted ? 'bg-amber-500 shadow-sm shadow-amber-500/30' : 'bg-white/10 hover:bg-white/15'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                bypassRestricted ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Warning / Disclaimer */}
        <div className={`mt-4 p-3.5 rounded-xl border text-xs leading-relaxed flex items-start gap-2.5 transition-colors ${
          bypassRestricted
            ? 'bg-amber-950/30 border-amber-600/40 text-amber-200/90'
            : 'bg-white/[0.02] border-white/5 text-gray-400'
        }`}>
          <Warning size={16} weight="fill" className={`shrink-0 mt-0.5 ${bypassRestricted ? 'text-amber-400' : 'text-gray-500'}`} />
          <div className="flex-1">
            <p className={`font-semibold mb-0.5 ${bypassRestricted ? 'text-amber-300' : 'text-gray-300'}`}>
              {t('settings.bypassRestrictedWarningTitle')}
            </p>
            <p className="opacity-90">
              {t('settings.bypassRestrictedWarningText')}
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

function ApiKeySection({ configKey = 'curseForgeApiKey', titleKey = 'settings.apiKey', hintKey = 'settings.apiKeyHint', url = 'https://console.curseforge.com/', urlLabel = 'console.curseforge.com', placeholder = '$2a$10$…' }) {
  const { t } = useT()
  const [key, setKey] = useState('')
  const [show, setShow] = useState(false)
  const [status, setStatus] = useState(null) // null | 'saving' | 'saved'

  useEffect(() => {
    window.api.getConfig().then(cfg => setKey(cfg?.[configKey] ?? ''))
  }, [configKey])

  const onSave = async () => {
    setStatus('saving')
    try {
      await window.api.setConfig(configKey, key.trim() || null)
      setStatus('saved')
      setTimeout(() => setStatus(null), 2500)
    } catch {
      setStatus(null)
    }
  }

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {t(titleKey)}
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-3 leading-relaxed">
          {t(hintKey)}{' '}
          <button
            onClick={() => window.api.openExternal(url)}
            className="text-emerald-300 underline hover:text-emerald-200"
          >
            {urlLabel}
          </button>
        </p>
        <div className="flex items-center gap-2">
          <input
            type={show ? 'text' : 'password'}
            value={key}
            onChange={e => setKey(e.target.value)}
            placeholder={placeholder}
            className="input flex-1 px-3 py-2 font-mono text-xs"
          />
          <button onClick={() => setShow(s => !s)} className="btn-ghost px-3 py-2 text-sm" title={show ? t('common.hide') : t('common.show')}>
            {show ? <EyeSlash size={16} weight="regular" /> : <Eye size={16} weight="regular" />}
          </button>
          <button onClick={onSave} disabled={status === 'saving'} className="btn-primary px-4 py-2 text-sm">
            {status === 'saving' ? t('common.saving') : status === 'saved' ? <><Check size={15} weight="bold" /> {t('common.saved')}</> : t('common.save')}
          </button>
        </div>
      </div>
    </section>
  )
}

const PROVIDER_ICON = { patreon: HeartStraight, pinterest: PushPin }

function ConnectedAccountsSection() {
  const { t } = useT()
  const [status, setStatus] = useState({})
  const [busy, setBusy] = useState(null)

  const refresh = () => window.api.getAuthStatus?.().then(s => setStatus(s ?? {}))
  useEffect(() => { refresh() }, [])

  const connect = async (provider) => {
    setBusy(provider)
    try {
      await window.api.connectAccount(provider) // opens the real login window
      await refresh()
    } finally {
      setBusy(null)
    }
  }
  const disconnect = async (provider) => {
    setBusy(provider)
    try {
      await window.api.disconnectAccount(provider)
      await refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {t('settings.connectedAccounts')}
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-4 leading-relaxed">
          {t('settings.connectedAccountsHint')}
        </p>
        <div className="flex flex-col gap-2">
          {Object.entries(status).map(([provider, s]) => {
            const PI = PROVIDER_ICON[provider] ?? Globe
            return (
            <div key={provider} className="flex items-center gap-3 bg-white/5 rounded-lg px-3 py-2.5">
              <PI size={20} weight="fill" className="text-emerald-400 shrink-0" />
              <span className="text-white text-sm font-medium">{s.label}</span>
              {s.connected
                ? <span className="badge bg-emerald-800/50 text-emerald-300"><Check size={11} weight="bold" /> {t('settings.connected')}</span>
                : <span className="badge bg-white/10 text-gray-400">{t('settings.notConnected')}</span>}
              <div className="ml-auto">
                {s.connected ? (
                  <button onClick={() => disconnect(provider)} disabled={busy === provider} className="btn-ghost px-3 py-1.5 text-xs">
                    {busy === provider ? '…' : t('common.disconnect')}
                  </button>
                ) : (
                  <button onClick={() => connect(provider)} disabled={busy === provider} className="btn-primary px-3 py-1.5 text-xs">
                    {busy === provider ? t('settings.waitingLogin') : t('common.connect')}
                  </button>
                )}
              </div>
            </div>
          )})}
          {Object.keys(status).length === 0 && (
            <p className="text-gray-600 text-xs">{t('common.loading')}</p>
          )}
        </div>
      </div>
    </section>
  )
}

function ThumbCacheSection() {
  const { t } = useT()
  const [status, setStatus] = useState(null)

  const onClear = async () => {
    setStatus('clearing')
    const res = await window.api.clearThumbCache()
    setStatus(res?.ok ? 'cleared' : 'error')
    setTimeout(() => setStatus(null), 2500)
  }

  return (
    <section className="mb-6 fade-in-up">
      <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
        {t('settings.thumbnailCache')}
      </h3>
      <div className="card p-5">
        <p className="text-gray-400 text-sm mb-3 leading-relaxed">
          {t('settings.thumbnailCacheHint')}
        </p>
        <div className="flex items-center gap-2">
          <button onClick={() => window.api.openThumbCache()} className="btn-ghost px-4 py-2 text-sm">
            <FolderOpen size={16} weight="fill" /> {t('settings.openCacheFolder')}
          </button>
          <button onClick={onClear} disabled={status === 'clearing'} className="btn-ghost px-4 py-2 text-sm">
            {status === 'clearing' ? t('cacheBanner.clearing')
              : status === 'cleared' ? <><Check size={15} weight="bold" /> {t('settings.cleared')}</>
              : status === 'error' ? <><Warning size={15} weight="bold" /> {t('common.failed')}</>
              : <><Broom size={15} weight="fill" /> {t('settings.clearCache')}</>}
          </button>
        </div>
      </div>
    </section>
  )
}

export default function Settings({ modsFolder, onFolderChanged }) {
  const { t } = useT()
  const [cacheStatus, setCacheStatus] = useState(null) // null | 'loading' | {success, msg}
  const [folderLoading, setFolderLoading] = useState(false)
  const [folderCheck, setFolderCheck] = useState(null) // { looksValid, ... } | null

  // Validate the configured folder whenever it changes, so we can warn if it
  // doesn't look like a Sims 4 Mods folder.
  useEffect(() => {
    let cancelled = false
    if (!modsFolder) { setFolderCheck(null); return }
    window.api.validateModsFolder?.(modsFolder).then(res => {
      if (!cancelled) setFolderCheck(res ?? null)
    }).catch(() => { if (!cancelled) setFolderCheck(null) })
    return () => { cancelled = true }
  }, [modsFolder])

  async function handleChangeFolder() {
    setFolderLoading(true)
    try {
      const folder = await window.api.selectFolder()
      if (!folder) { setFolderLoading(false); return }
      await window.api.setConfig('modsFolder', folder)
      onFolderChanged(folder)
    } catch (err) {
      console.error('Failed to change folder:', err)
    }
    setFolderLoading(false)
  }

  async function handleClearCache() {
    setCacheStatus('loading')
    const result = await window.api.clearGameCache()
    if (result.success) {
      setCacheStatus({
        success: true,
        msg: result.alreadyGone
          ? 'Cache file was already gone — nothing to delete.'
          : 'localthumbcache.package deleted successfully!'
      })
    } else {
      setCacheStatus({ success: false, msg: result.error })
    }
    // auto-clear status after 5s
    setTimeout(() => setCacheStatus(null), 5000)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 pt-4 pb-3 border-b border-white/5 shrink-0">
        <h2 className="page-title">{t('settings.title')}</h2>
        <p className="page-subtitle">{t('settings.subtitle')}</p>
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5">
        {/* Mods Folder */}
        <section className="mb-6 fade-in-up">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {t('settings.modsFolder')}
          </h3>
          <div className="card p-5">
            <p className="text-xs text-gray-500 mb-1">{t('settings.currentPath')}</p>
            <p className="text-gray-200 font-mono text-sm break-all mb-4">
              {modsFolder ?? <span className="text-red-400">{t('settings.notConfigured')}</span>}
            </p>
            <button
              onClick={handleChangeFolder}
              disabled={folderLoading}
              className="btn-ghost py-2 px-4 text-sm"
            >
              {folderLoading ? t('settings.opening') : <><Folder size={16} weight="fill" /> {t('settings.changeModsFolder')}</>}
            </button>

            {/* warn if the folder doesn't look like a Sims 4 Mods folder */}
            {modsFolder && folderCheck && !folderCheck.looksValid && (
              <div className="mt-4 text-xs px-4 py-3 rounded-xl border text-amber-300 bg-amber-950/40 border-amber-800/50 flex items-start gap-2">
                <Warning size={15} weight="fill" className="shrink-0 mt-0.5" />
                <span>{t('settings.folderInvalid')}</span>
              </div>
            )}
            {modsFolder && folderCheck?.looksValid && (
              <p className="mt-3 text-emerald-400/80 text-xs flex items-center gap-1.5">
                <CheckCircle size={14} weight="fill" /> {t('settings.folderValid')}
              </p>
            )}
          </div>
        </section>

        <AppUpdatesSection />

        <ThemeSection />
        <LanguageSection />
        <ConnectedAccountsSection />
        <CurseForgeSettingsSection />
        <ApiKeySection
          configKey="tumblrApiKey"
          titleKey="settings.tumblrApiKey"
          hintKey="settings.tumblrApiKeyHint"
          url="https://www.tumblr.com/oauth/apps"
          urlLabel="tumblr.com/oauth/apps"
          placeholder="OAuth Consumer Key…"
        />
        <ThumbCacheSection />

        {/* Game Cache */}
        <section className="mb-6 fade-in-up">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
            {t('settings.gameCache')}
          </h3>
          <div className="card p-5">
            <p className="text-gray-400 text-sm mb-4 leading-relaxed">
              {t('settings.gameCacheHint')}
            </p>
            <button
              onClick={handleClearCache}
              disabled={cacheStatus === 'loading' || !modsFolder}
              className="btn-danger py-2 px-5 text-sm font-semibold"
            >
              <Trash size={15} weight="bold" /> {cacheStatus === 'loading' ? t('settings.deleting') : t('settings.clearGameCache')}
            </button>

            {!modsFolder && (
              <p className="mt-3 text-amber-400 text-xs">
                {t('settings.configureFolderFirst')}
              </p>
            )}

            {cacheStatus && cacheStatus !== 'loading' && (
              <div className={`mt-4 text-sm px-4 py-2 rounded-xl border flex items-center gap-2 ${
                cacheStatus.success
                  ? 'text-emerald-300 bg-emerald-950/50 border-emerald-800/60'
                  : 'text-red-300 bg-red-950/60 border-red-800/60'
              }`}>
                {cacheStatus.success ? <CheckCircle size={16} weight="fill" /> : <XCircle size={16} weight="fill" />} {cacheStatus.msg}
              </div>
            )}
          </div>
        </section>

        <SupportSection />
      </div>
    </div>
  )
}
