/**
 * Rendering quality tiers. The starting tier comes from cheap device signals;
 * drei's <PerformanceMonitor> steps it down at runtime when the frame rate
 * stays low (automatic mode only). `?quality=` or the settings menu override it.
 *
 *  high   – desktop: DPR ≤ 2, dense terrain, detail patches, post-processing, shadows
 *  medium – laptop / strong tablet: DPR ≤ 1.5, lighter terrain, bloom only
 *  low    – phones / weak GPUs: DPR 1, half-resolution data, no post-processing
 */
export type Quality = 'high' | 'medium' | 'low'

/** matchMedia is missing in some embedded browsers (and in jsdom). */
const media = (query: string) => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(query).matches

export function detectQuality(): Quality {
  if (typeof window === 'undefined') return 'medium'
  const nav = navigator as Navigator & { deviceMemory?: number }
  const touch = media('(pointer: coarse)')
  const small = Math.min(screen.width, screen.height) < 500
  const cores = nav.hardwareConcurrency ?? 4
  const memory = nav.deviceMemory ?? 4
  if (touch && (small || cores <= 4 || memory <= 3)) return 'low'
  if (touch || cores <= 4 || memory <= 4) return 'medium'
  return 'high'
}

export interface QualityPreset {
  dpr: [number, number]
  heightmap: string
  colorMap: string
  /** Terrain grid segments along the east-west axis. */
  segments: number
  patchSegments: number
  postfx: boolean
  bloom: boolean
  shadows: boolean
  stars: number
}

export const QUALITY: Record<Quality, QualityPreset> = {
  high: {
    dpr: [1, 2],
    heightmap: '/terrain/terrain.png',
    colorMap: '/terrain/terrain-color.webp',
    segments: 512,
    patchSegments: 192,
    postfx: true,
    bloom: true,
    shadows: true,
    stars: 3000,
  },
  medium: {
    dpr: [1, 1.5],
    heightmap: '/terrain/terrain.png',
    colorMap: '/terrain/terrain-color.webp',
    segments: 384,
    patchSegments: 128,
    postfx: true,
    bloom: true,
    shadows: false,
    stars: 1800,
  },
  low: {
    dpr: [1, 1],
    heightmap: '/terrain/terrain-low.png',
    colorMap: '/terrain/terrain-color-low.webp',
    segments: 256,
    patchSegments: 96,
    postfx: false,
    bloom: false,
    shadows: false,
    stars: 800,
  },
}

export function hasWebGL(): boolean {
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('webgl') === '0') return false
  try {
    const canvas = document.createElement('canvas')
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'))
  } catch {
    return false
  }
}

export const prefersReducedMotion = () => media('(prefers-reduced-motion: reduce)')

export const isDebug = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('debug')
