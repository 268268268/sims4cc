import { useState, useEffect, useCallback } from 'react'
import { X, CaretLeft, CaretRight, CircleNotch } from '@phosphor-icons/react'

/**
 * Full-screen in-app image viewer for a set of screenshots.
 * Layers above the detail modal (z-[60]); Esc/←/→ handled in the capture phase
 * so the underlying Modal's own Esc-to-close never fires while this is open.
 */
export default function Lightbox({ images, index = 0, onClose }) {
  const count = images.length
  const [i, setI] = useState(index)
  const [loaded, setLoaded] = useState(false)

  const go = useCallback((delta) => {
    setLoaded(false)
    setI(x => (x + delta + count) % count)
  }, [count])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopImmediatePropagation(); onClose() }
      else if (e.key === 'ArrowLeft') { e.stopImmediatePropagation(); go(-1) }
      else if (e.key === 'ArrowRight') { e.stopImmediatePropagation(); go(1) }
    }
    window.addEventListener('keydown', onKey, true) // capture: beat the Modal's listener
    return () => window.removeEventListener('keydown', onKey, true)
  }, [onClose, go])

  const img = images[i]
  const src = img?.url || img?.thumbnailUrl

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 select-none" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/90 backdrop-blur-sm" />

      <button
        onClick={onClose}
        className="absolute top-4 right-4 z-10 w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
        title="Close (Esc)"
      >
        <X size={22} weight="bold" />
      </button>

      {count > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); go(-1) }}
            className="absolute left-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="Previous (←)"
          >
            <CaretLeft size={24} weight="bold" />
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); go(1) }}
            className="absolute right-4 top-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors"
            title="Next (→)"
          >
            <CaretRight size={24} weight="bold" />
          </button>
        </>
      )}

      <img
        key={i}
        src={src}
        alt={img?.title || `Screenshot ${i + 1}`}
        onMouseDown={(e) => e.stopPropagation()}
        onLoad={() => setLoaded(true)}
        className={`relative max-h-[86vh] max-w-[92vw] object-contain rounded-lg shadow-2xl transition-opacity duration-200 ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />

      {!loaded && (
        <CircleNotch size={32} weight="bold" className="absolute z-0 text-white/50 animate-spin" />
      )}

      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 z-10">
        {img?.title && <p className="text-gray-200 text-sm max-w-lg text-center px-4 truncate">{img.title}</p>}
        {count > 1 && <span className="text-gray-400 text-xs">{i + 1} / {count}</span>}
      </div>
    </div>
  )
}
