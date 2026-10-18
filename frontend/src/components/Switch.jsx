/**
 * Accessible on/off switch. Green track when on, neutral when off — reads as a
 * state control, not a destructive action (the old full-width red "Disable"
 * button made disabling feel dangerous).
 */
export default function Switch({ on, pending, onClick, title, size = 'md' }) {
  const dims = size === 'sm'
    ? { track: 'w-8 h-[18px]', knob: 'w-3.5 h-3.5', on: 'translate-x-[14px]' }
    : { track: 'w-10 h-[22px]', knob: 'w-[18px] h-[18px]', on: 'translate-x-[18px]' }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      title={title}
      onClick={onClick}
      className={`relative shrink-0 rounded-full transition-colors duration-200 ${dims.track}
        focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/60
        disabled:opacity-50 disabled:cursor-not-allowed
        ${on ? 'bg-emerald-500/90' : 'bg-white/15 hover:bg-white/25'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow-sm transition-transform duration-200
          ${dims.knob} ${on ? dims.on : 'translate-x-0'} ${pending ? 'animate-pulse' : ''}`}
      />
    </button>
  )
}
