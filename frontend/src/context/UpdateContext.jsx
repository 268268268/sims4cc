import { createContext, useContext, useState, useEffect, useCallback } from 'react'

const UpdateContext = createContext(null)

export function UpdateProvider({ children }) {
  const [currentVersion, setCurrentVersion] = useState('2.0.0')
  const [updateInfo, setUpdateInfo] = useState(null)
  const [checking, setChecking] = useState(false)
  const [status, setStatus] = useState('idle') // idle | checking | downloading | extracting | installing | ready | error
  const [progress, setProgress] = useState({ percent: 0, downloaded: 0, total: 0 })
  const [error, setError] = useState(null)
  const [bannerDismissed, setBannerDismissed] = useState(false)

  // Fetch current version on mount
  useEffect(() => {
    if (window.api?.getAppVersion) {
      window.api.getAppVersion().then(v => {
        if (typeof v === 'string') setCurrentVersion(v)
      }).catch(console.error)
    }
  }, [])

  const checkForUpdate = useCallback(async (manual = false) => {
    setChecking(true)
    if (manual) {
      setError(null)
    }
    try {
      const res = await window.api.checkForAppUpdate()
      setUpdateInfo(res)
      if (res?.hasUpdate) {
        setBannerDismissed(false)
      }
      return res
    } catch (err) {
      if (manual) {
        setError(err?.message || String(err))
      }
      return null
    } finally {
      setChecking(false)
    }
  }, [])

  // Auto check on startup
  useEffect(() => {
    const timer = setTimeout(() => {
      checkForUpdate(false)
    }, 1200)
    return () => clearTimeout(timer)
  }, [checkForUpdate])

  // Subscribe to progress events from backend
  useEffect(() => {
    if (!window.api?.onAppUpdateProgress) return
    const unsub = window.api.onAppUpdateProgress((data) => {
      if (!data) return
      if (data.status) setStatus(data.status)
      if (data.percent !== undefined) {
        setProgress({
          percent: Math.min(100, Math.max(0, Math.round(data.percent))),
          downloaded: data.downloaded || 0,
          total: data.total || 0
        })
      }
      if (data.status === 'error' && data.error) {
        setError(data.error)
      }
    })
    return () => unsub?.()
  }, [])

  const downloadAndInstall = useCallback(async () => {
    setStatus('downloading')
    setError(null)
    setProgress({ percent: 0, downloaded: 0, total: 0 })
    try {
      await window.api.downloadAndInstallUpdate()
      setStatus('ready')
    } catch (err) {
      setStatus('error')
      setError(err?.message || String(err))
    }
  }, [])

  const restartApp = useCallback(async () => {
    try {
      await window.api.restartApp()
    } catch (err) {
      setError(err?.message || String(err))
    }
  }, [])

  const dismissBanner = useCallback(() => {
    setBannerDismissed(true)
  }, [])

  const hasUpdate = Boolean(updateInfo?.hasUpdate)
  const showBanner = hasUpdate && !bannerDismissed

  const value = {
    currentVersion,
    updateInfo,
    hasUpdate,
    checking,
    status,
    progress,
    error,
    showBanner,
    dismissBanner,
    checkForUpdate,
    downloadAndInstall,
    restartApp,
  }

  return (
    <UpdateContext.Provider value={value}>
      {children}
    </UpdateContext.Provider>
  )
}

export function useAppUpdate() {
  const ctx = useContext(UpdateContext)
  if (!ctx) {
    throw new Error('useAppUpdate must be used within UpdateProvider')
  }
  return ctx
}
