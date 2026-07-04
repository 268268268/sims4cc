import { useState, useEffect } from 'react'

const LINK_LABELS = {
  patreon: { label: 'Patreon', icon: '💰', color: 'bg-orange-700 hover:bg-orange-600' },
  tumblr: { label: 'Tumblr', icon: '📝', color: 'bg-blue-700 hover:bg-blue-600' },
  twitter: { label: 'Twitter', icon: '🐦', color: 'bg-sky-700 hover:bg-sky-600' },
  website: { label: 'Website', icon: '🌐', color: 'bg-gray-700 hover:bg-gray-600' },
  discord: { label: 'Discord', icon: '💬', color: 'bg-indigo-700 hover:bg-indigo-600' },
  youtube: { label: 'YouTube', icon: '▶️', color: 'bg-red-700 hover:bg-red-600' }
}

function CreatorCard({ creator }) {
  const links = Object.entries(creator.links ?? {}).filter(([, url]) => url)

  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-full bg-purple-600 flex items-center justify-center text-xl font-bold text-white shrink-0">
          {creator.name?.charAt(0)?.toUpperCase() ?? '?'}
        </div>
        <h3 className="text-white font-semibold text-sm leading-tight truncate" title={creator.name}>
          {creator.name}
        </h3>
      </div>

      {links.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {links.map(([key, url]) => {
            const meta = LINK_LABELS[key] ?? { label: key, icon: '🔗', color: 'bg-gray-700 hover:bg-gray-600' }
            return (
              <button
                key={key}
                onClick={() => window.api.openExternal(url)}
                className={`flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded text-white transition-colors ${meta.color}`}
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
      console.log('Renderer: Calling window.api.getCatalog...')
      setIsLoading(true)
      try {
        const data = await window.api.getCatalog()
        console.log('Fetched catalog data in UI:', data)
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
      <div className="px-8 py-5 border-b border-gray-800 shrink-0">
        <h2 className="text-2xl font-bold text-white">Creators</h2>
        <p className="text-gray-500 text-xs mt-0.5">
          Browse all creators from the catalog
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-8 py-6">
        {/* DEBUG: temporary raw JSON dump to confirm IPC data arrival */}
        <pre className="text-xs text-green-400 bg-black/50 p-2 rounded mb-4 max-h-40 overflow-auto">
          {JSON.stringify(catalog, null, 2)}
        </pre>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500 gap-3">
            <span className="animate-spin text-4xl inline-block w-10 h-10 border-4 border-purple-500 border-t-transparent rounded-full" />
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