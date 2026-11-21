/**
 * Picks a rendering quality tier from cheap device signals. drei's
 * <PerformanceMonitor> refines it at runtime if the frame rate drops.
 *
 *  high   – desktop / strong laptop: DPR up to 2, full terrain, post-processing
 *  medium – average laptop or strong phone: DPR 1.5, full terrain, light post-processing
 *  low    – weak phone: DPR 1, half-res terrain, no post-processing
 */
export type Quality = 'high' | 'medium' | 'low'

export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'medium'
  const nav = navigator as Navigator & { deviceMemory?: number }
  const params = new URLSearchParams(window.location.search)
  const forced = params.get('quality')
  if (forced === 'high' || forced === 'medium' || forced === 'low') return forced

  const touch = matchMedia('(pointer: coarse)').matches
  const small = Math.min(screen.width, screen.height) < 500
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4

  if (touch && (small || cores <= 4 || memory <= 3)) return 'low'
  if (touch || cores <= 4 || memory <= 4) return 'medium'
  return 'high'
}

export const QUALITY = {
  high: { dpr: [1, 2] as [number, number], terrain: '/terrain/terrain.png', segments: 1, postfx: true, shadows: true },
  medium: { dpr: [1, 1.5] as [number, number], terrain: '/terrain/terrain.png', segments: 0.7, postfx: true, shadows: false },
  low: { dpr: [1, 1] as [number, number], terrain: '/terrain/terrain-low.png', segments: 0.5, postfx: false, shadows: false },
} satisfies Record<Quality, unknown>

export function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
