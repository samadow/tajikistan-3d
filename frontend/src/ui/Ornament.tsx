/**
 * Suzani-style rosette: an eight-petal flower inside concentric rings, drawn as
 * strokes so it can be "embroidered" progressively (see Loader).
 */
export function Rosette({ size = 120, progress = 1, className = '' }: { size?: number; progress?: number; className?: string }) {
  const petals = Array.from({ length: 8 }, (_, i) => i * 45)
  const dash = 400
  const offset = dash * (1 - Math.min(Math.max(progress, 0), 1))
  const stroke = { strokeDasharray: dash, strokeDashoffset: offset }
  return (
    <svg width={size} height={size} viewBox="-60 -60 120 120" className={`rosette-draw ${className}`} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
        <circle r="56" style={stroke} opacity="0.35" />
        <circle r="50" style={stroke} strokeDasharray="2 6" opacity="0.6" />
        {petals.map((a) => (
          <path key={a} transform={`rotate(${a})`} d="M0 -8 C 10 -18, 12 -34, 0 -44 C -12 -34, -10 -18, 0 -8Z" style={stroke} />
        ))}
        {petals.map((a) => (
          <path key={`s${a}`} transform={`rotate(${a + 22.5})`} d="M0 -14 L 5 -26 L 0 -34 L -5 -26Z" style={stroke} opacity="0.7" />
        ))}
      </g>
    </svg>
  )
}

/** Small eight-point star used as the logo mark. */
export function StarMark({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" className={className} aria-hidden>
      <g fill="none" stroke="currentColor" strokeWidth="3">
        <path d="M32 6 39 25 58 32 39 39 32 58 25 39 6 32 25 25Z" />
        <path d="M32 14 45 19 50 32 45 45 32 50 19 45 14 32 19 19Z" opacity="0.5" />
        <circle cx="32" cy="32" r="5" fill="currentColor" />
      </g>
    </svg>
  )
}
