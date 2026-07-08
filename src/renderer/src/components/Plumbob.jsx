// The green gem that floats over every Sim's head — our brand mark.
// spin=true turns it into a branded loader (plumbobs rotate in-game).
export default function Plumbob({ size = 24, spin = false, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`${spin ? 'animate-spin' : ''} ${className}`}
      style={spin ? { animationDuration: '1.6s' } : undefined}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="pb-l" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#34d399" />
          <stop offset="1" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="pb-r" x1="1" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#6ee7b7" />
          <stop offset="1" stopColor="#0d9488" />
        </linearGradient>
      </defs>
      {/* two vertical body facets + a bright top facet = faceted gem look */}
      <polygon points="12,1.5 12,22.5 3,9" fill="url(#pb-l)" />
      <polygon points="12,1.5 12,22.5 21,9" fill="url(#pb-r)" />
      <polygon points="12,1.5 3,9 21,9" fill="#a7f3d0" opacity="0.55" />
    </svg>
  )
}
