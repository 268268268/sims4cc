import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { markChanged } from '../lib/sessionActivity'
import { pickLatestFile } from '../lib/cfFile'

const DownloadQueueContext = createContext(null)

export function DownloadQueueProvider({ children }) {
  const [queue, setQueue] = useState([])
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [bypassRestricted, setBypassRestrictedState] = useState(false)
  const completedIdsRef = useRef(new Set())
  const completionListenersRef = useRef(new Set())

  useEffect(() => {
    window.api?.getConfig?.().then(c => {
      setBypassRestrictedState(Boolean(c?.bypassRestrictedDownloads))
    }).catch(() => {})

    const onConfigUpdated = (e) => {
      if (e?.detail?.bypassRestrictedDownloads !== undefined) {
        setBypassRestrictedState(Boolean(e.detail.bypassRestrictedDownloads))
      } else {
        window.api?.getConfig?.().then(c => {
          setBypassRestrictedState(Boolean(c?.bypassRestrictedDownloads))
        }).catch(() => {})
      }
    }
    window.addEventListener('config-updated', onConfigUpdated)
    return () => window.removeEventListener('config-updated', onConfigUpdated)
  }, [])

  const setBypassRestricted = useCallback(async (val) => {
    setBypassRestrictedState(val)
    try {
      await window.api?.setConfig?.('bypassRestrictedDownloads', val)
      window.dispatchEvent(new CustomEvent('config-updated', { detail: { bypassRestrictedDownloads: val } }))
    } catch (e) {
      console.error('Failed to save bypassRestrictedDownloads:', e)
    }
  }, [])

  const applyQueue = useCallback((nextList) => {
    if (!Array.isArray(nextList)) return
    setQueue(nextList)

    let newlyCompleted = false
    for (const job of nextList) {
      if (job.status === 'completed' && !completedIdsRef.current.has(job.id)) {
        completedIdsRef.current.add(job.id)
        newlyCompleted = true
        if (job.kind === 'curseforge' && job.modId) {
          window.dispatchEvent(new CustomEvent('curseforge-installed', { detail: { modId: Number(job.modId) } }))
        }
        for (const fn of completionListenersRef.current) {
          try { fn(job) } catch {}
        }
      } else if (job.status === 'queued' || job.status === 'downloading') {
        completedIdsRef.current.delete(job.id)
      }
    }
    if (newlyCompleted) {
      markChanged()
      window.dispatchEvent(new CustomEvent('local-mods-changed'))
    }
  }, [])

  useEffect(() => {
    window.api?.getDownloadQueue?.().then(list => {
      if (Array.isArray(list)) {
        for (const j of list) {
          if (j.status === 'completed') completedIdsRef.current.add(j.id)
        }
        setQueue(list)
      }
    }).catch(() => {})

    const off = window.api?.onDownloadQueueUpdate?.((list) => {
      applyQueue(list)
    })
    return () => off?.()
  }, [applyQueue])

  const activeCount = useMemo(
    () => queue.filter(j => j.status === 'queued' || j.status === 'downloading' || j.status === 'installing').length,
    [queue]
  )

  // Поддерживаем легкий опрос очереди, пока есть активные загрузки (гарантия реактивности при переключении окон)
  useEffect(() => {
    if (activeCount === 0) return
    const timer = setInterval(() => {
      window.api?.getDownloadQueue?.().then(applyQueue).catch(() => {})
    }, 650)
    return () => clearInterval(timer)
  }, [activeCount, applyQueue])

  const enqueueCurseForge = useCallback(async (mod, isUpdate = false) => {
    const latest = pickLatestFile(mod)
    const payload = {
      ...mod,
      fileId: mod.fileId || latest?.id,
      fileName: mod.fileName || latest?.fileName,
      downloadUrl: mod.downloadUrl || latest?.downloadUrl || ''
    }
    const job = await window.api.enqueueCurseForgeDownload(payload, isUpdate)
    if (job?.id) {
      setQueue(prev => {
        const filtered = prev.filter(j => j.id !== job.id)
        return [job, ...filtered]
      })
    }
    return job
  }, [])

  const enqueueDiscover = useCallback(async (item) => {
    const job = await window.api.enqueueDiscoverDownload(item)
    if (job?.id) {
      setQueue(prev => {
        const filtered = prev.filter(j => j.id !== job.id)
        return [job, ...filtered]
      })
    }
    return job
  }, [])

  const cancelJob = useCallback(async (jobId) => {
    await window.api?.cancelDownloadJob?.(jobId)
    const list = await window.api?.getDownloadQueue?.()
    applyQueue(list)
  }, [applyQueue])

  const retryJob = useCallback(async (jobId) => {
    await window.api?.retryDownloadJob?.(jobId)
    const list = await window.api?.getDownloadQueue?.()
    applyQueue(list)
  }, [applyQueue])

  const clearCompleted = useCallback(async () => {
    const list = await window.api?.clearCompletedDownloads?.()
    applyQueue(list)
  }, [applyQueue])

  const onJobCompleted = useCallback((cb) => {
    completionListenersRef.current.add(cb)
    return () => completionListenersRef.current.delete(cb)
  }, [])

  const jobsById = useMemo(() => {
    const map = new Map()
    for (const j of queue) {
      map.set(j.id, j)
      if (j.itemId) map.set(String(j.itemId), j)
    }
    return map
  }, [queue])

  const getCurseForgeJob = useCallback((modId) => {
    return jobsById.get(`cf:${modId}`) || jobsById.get(String(modId)) || null
  }, [jobsById])

  const getDiscoverJob = useCallback((itemId) => {
    return jobsById.get(`disc:${itemId}`) || jobsById.get(String(itemId)) || null
  }, [jobsById])

  const value = useMemo(() => ({
    queue,
    activeCount,
    drawerOpen,
    setDrawerOpen,
    bypassRestricted,
    setBypassRestricted,
    enqueueCurseForge,
    enqueueDiscover,
    cancelJob,
    retryJob,
    clearCompleted,
    getCurseForgeJob,
    getDiscoverJob,
    onJobCompleted
  }), [
    queue,
    activeCount,
    drawerOpen,
    bypassRestricted,
    setBypassRestricted,
    enqueueCurseForge,
    enqueueDiscover,
    cancelJob,
    retryJob,
    clearCompleted,
    getCurseForgeJob,
    getDiscoverJob,
    onJobCompleted
  ])

  return (
    <DownloadQueueContext.Provider value={value}>
      {children}
    </DownloadQueueContext.Provider>
  )
}

export function useDownloadQueue() {
  const ctx = useContext(DownloadQueueContext)
  if (!ctx) throw new Error('useDownloadQueue must be used within DownloadQueueProvider')
  return ctx
}
