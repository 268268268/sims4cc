import { useEffect } from 'react'

/** Centered overlay dialog: closes on backdrop click, Esc, or the ✕ button. */
export default function Modal({ onClose, children, maxWidth = 'max-w-2xl' }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onMouseDown={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className={`relative ${maxWidth} w-full max-h-[88vh] overflow-y-auto bg-[#12141f] border border-white/10 rounded-2xl shadow-2xl shadow-black/50 fade-in-up`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 w-8 h-8 rounded-lg bg-black/50 hover:bg-black/70 text-gray-300 hover:text-white flex items-center justify-center transition-colors"
          title="Close (Esc)"
        >
          ✕
        </button>
        {children}
      </div>
    </div>
  )
}
