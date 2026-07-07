export function formatBytes(n) {
  if (n == null) return null
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(1)} MB`
}

export function formatCount(n) {
  if (n == null) return null
  if (n < 1000) return `${n}`
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function formatDate(iso) {
  if (!iso) return null
  try {
    return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  } catch {
    return null
  }
}

/** Coarse relative time: "today", "3 d ago", "2 mo ago", "1 y ago". */
export function formatRelative(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return null
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days < 0) return null
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} d ago`
  if (days < 365) return `${Math.floor(days / 30)} mo ago`
  return `${Math.floor(days / 365)} y ago`
}
