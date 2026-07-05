// Phase 3
export default function CustomCatalog() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-8 pt-6 pb-4 border-b border-white/5 shrink-0">
        <h2 className="page-title">Custom Catalog</h2>
        <p className="page-subtitle">Curated creator collections</p>
      </div>

      <div className="flex-1 flex items-center justify-center px-8">
        <div className="card p-10 text-center max-w-sm fade-in-up">
          <div className="text-5xl mb-4">📚</div>
          <p className="text-white font-semibold mb-1">Coming soon</p>
          <p className="text-gray-500 text-sm leading-relaxed">
            A hand-picked catalog of creators and collections is on its way.
          </p>
        </div>
      </div>
    </div>
  )
}
