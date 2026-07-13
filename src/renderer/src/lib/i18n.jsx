import { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react'
import en from './locales/en'
import ru from './locales/ru'

const DICTS = { en, ru }

// Switcher options. 'auto' resolves to the system language at runtime.
export const LANG_OPTIONS = [
  { id: 'auto', label: 'Auto', native: 'Auto' },
  { id: 'en', label: 'English', native: 'English' },
  { id: 'ru', label: 'Russian', native: 'Русский' }
]

function detectSystemLang() {
  const nav = (navigator.language || 'en').toLowerCase()
  return nav.startsWith('ru') ? 'ru' : 'en'
}

/** Resolve a stored preference ('auto' | 'en' | 'ru') to a concrete dict code. */
function resolve(pref) {
  return pref === 'ru' || pref === 'en' ? pref : detectSystemLang()
}

function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o == null ? undefined : o[k]), dict)
}

function interpolate(str, vars) {
  if (typeof str !== 'string' || !vars) return str
  return str.replace(/\{(\w+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : `{${k}}`))
}

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  // 'auto' | 'en' | 'ru'. localStorage gives an instant, flash-free first paint;
  // config is mirrored for parity with the rest of the settings.
  const [pref, setPref] = useState(() => localStorage.getItem('lang') || 'auto')
  const lang = resolve(pref)

  const setLanguage = useCallback((p) => {
    localStorage.setItem('lang', p)
    setPref(p)
    window.api?.setConfig?.('language', p)
  }, [])

  useEffect(() => { document.documentElement.lang = lang }, [lang])

  // t('area.key', { name }) — active dict, then English, then the key itself.
  const t = useCallback((key, vars) => {
    const val = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? key
    return interpolate(val, vars)
  }, [lang])

  const value = useMemo(() => ({ t, lang, pref, setLanguage }), [t, lang, pref, setLanguage])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useT() {
  const ctx = useContext(I18nContext)
  if (!ctx) throw new Error('useT must be used within I18nProvider')
  return ctx
}
