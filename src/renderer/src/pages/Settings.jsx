import { useState, useEffect } from 'react'
import { Eye, EyeSlash, Check, Globe, HeartStraight, PushPin, FolderOpen, Broom, Warning, Folder, Trash, CheckCircle, XCircle, Translate, Coffee, Copy, CurrencyCircleDollar } from '@phosphor-icons/react'
import { useT, LANG_OPTIONS } from '../lib/i18n'

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

        <LanguageSection />
        <ConnectedAccountsSection />
        <ApiKeySection />
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
