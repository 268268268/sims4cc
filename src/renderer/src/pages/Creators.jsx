import { useState, useEffect } from 'react'

const LINK_LABELS = {
  patreon: { label: 'Patreon', icon: '💰', color: 'bg-orange-600/80 hover:bg-orange-500' },
  tumblr: { label: 'Tumblr', icon: '📝', color: 'bg-blue-600/80 hover:bg-blue-500' },
  twitter: { label: 'Twitter', icon: '🐦', color: 'bg-sky-600/80 hover:bg-sky-500' },
  website: { label: 'Website', icon: '🌐', color: 'bg-gray-600/80 hover:bg-gray-500' },
  discord: { label: 'Discord', icon: '💬', color: 'bg-indigo-600/80 hover:bg-indigo-500' },
  youtube: { label: 'YouTube', icon: '▶️', color: 'bg-red-600/80 hover:bg-red-500' }
}

function CreatorCard({ creator }) {
  // real catalog schema: { id, name, patreon_url, categories[], status };
  // keep the legacy links object as a forward-compat fallback
  const links = Object.entries(creator.links ?? {}).filter(([, url]) => url)
  if (creator.patreon_url && !links.some(([k]) => k === 'patreon')) {
    links.unshift(['patreon', creator.patreon_url])
  }
  const status = creator.status ?? null

  return (
    <div className="card card-hover fade-in-up p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 flex items-center justify-center text-xl font-bold text-white shrink-0 shadow-md shadow-violet-950/50">
          {creator.name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <div className="min-w-0">
          <h3 className="text-white font-semibold text-sm leading-tight truncate" title={creator.name}>
            {creator.name}
          </h3>
          {status && (
            <span className={`badge mt-1 ${status === 'active' ? 'bg-emerald-800/50 text-emerald-300' : 'bg-gray-700/60 text-gray-400'}`}>
              {status}
            </span>
          )}
        </div>
      </div>

      {creator.categories?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {creator.categories.map(c => (
            <span key={c} className="badge bg-white/5 text-gray-400">{c}</span>
          ))}
        </div>
      )}

      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map(([key, url]) => {
            const meta = LINK_LABELS[key] ?? { label: key, icon: '🔗', color: 'bg-gray-600/80 hover:bg-gray-500' }
            return (
              <button
                key={key}
                onClick={() => window.api.openExternal(url)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-lg text-white transition-colors ${meta.color}`}
                title={url}
              >
                <span>{meta.icon}</span>
                {meta.label}
              </button>
            )
          })}
        </div>
      ) : (
        <p className="text-gray-600 text-xs">No links available</p>
      )}
    </div>
  )
}

export default function Creators() {
  const [catalog, setCatalog] = useState({ creators: [], items: [] })
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      setIsLoading(true)
      try {
        const data = await window.api.getCatalog()
        if (data) setCatalog(data)
      } catch (err) {
        console.error('Failed to load catalog:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-white/5 shrink-0">
        <h2 className="page-title">Creators</h2>
        <p className="page-subtitle">
          Browse all creators from the catalog
          {catalog?.last_updated && ` · updated ${new Date(catalog.last_updated).toLocaleDateString()}`}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-3">
            <span className="animate-spin inline-block w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full" />
            <p className="text-sm">Loading creators…</p>
          </div>
        ) : (catalog?.creators ?? []).length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-600 gap-3">
            <span className="text-5xl">🎨</span>
            <p className="text-sm">No creators found in the catalog.</p>
          </div>
        ) : (
          <>
            <p className="text-gray-500 text-xs mb-4">
              {(catalog?.creators ?? []).length} creator{(catalog?.creators ?? []).length !== 1 ? 's' : ''}
            </p>
            <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
              {(catalog?.creators ?? []).map(c => (
                <CreatorCard key={c.id ?? c.name} creator={c} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
