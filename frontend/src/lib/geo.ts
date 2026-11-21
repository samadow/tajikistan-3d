/**
 * Projection shared with backend/landmarks/geo.py and tools/terrain/build_heightmap.py.
 * The constants are read from /terrain/bounds.json (written by the build script),
 * so the three implementations cannot drift apart.
 */
export interface Bounds {
  lonMin: number
  lonMax: number
  latMin: number
  latMax: number
  mapWidth: number
  mapDepth: number
  heightScale: number
  elevationMin: number
  elevationMax: number
  imageWidth: number
  imageHeight: number
  attribution: string
}

export interface TerrainData {
  bounds: Bounds
  /** Elevation in metres, row-major, row 0 = north. */
  heights: Float32Array
  /** Country mask 0..1 (1 = inside Tajikistan). */
  mask: Float32Array
  width: number
  height: number
  border: [number, number][][]
}

/** lon/lat → world x/z (y is elevation-dependent, see sampleHeight). */
export function projectXZ(b: Bounds, lon: number, lat: number): [number, number] {
  const u = (lon - b.lonMin) / (b.lonMax - b.lonMin)
  const v = (lat - b.latMin) / (b.latMax - b.latMin)
  return [(u - 0.5) * b.mapWidth, (0.5 - v) * b.mapDepth]
}

/** Bilinear sample of a grid at world x/z. */
function sampleGrid(t: TerrainData, grid: Float32Array, x: number, z: number): number {
  const { bounds: b, width: w, height: h } = t
  const u = Math.min(Math.max(x / b.mapWidth + 0.5, 0), 1) * (w - 1)
  const v = Math.min(Math.max(z / b.mapDepth + 0.5, 0), 1) * (h - 1)
  const x0 = Math.floor(u)
  const y0 = Math.floor(v)
  const x1 = Math.min(x0 + 1, w - 1)
  const y1 = Math.min(y0 + 1, h - 1)
  const fx = u - x0
  const fy = v - y0
  const a = grid[y0 * w + x0] * (1 - fx) + grid[y0 * w + x1] * fx
  const c = grid[y1 * w + x0] * (1 - fx) + grid[y1 * w + x1] * fx
  return a * (1 - fy) + c * fy
}

/** World-space terrain height (already scaled + exaggerated) at x/z. */
export function sampleHeight(t: TerrainData, x: number, z: number): number {
  return sampleGrid(t, t.heights, x, z) * t.bounds.heightScale
}

export function sampleMask(t: TerrainData, x: number, z: number): number {
  return sampleGrid(t, t.mask, x, z)
}

// --- Loading ---------------------------------------------------------------

const cache = new Map<string, Promise<TerrainData>>()

/**
 * Loads terrain.png (R/G = 16-bit elevation, B = country mask) plus bounds/border JSON.
 * Decoding with colorSpaceConversion:'none' keeps the raw byte values intact.
 */
export function loadTerrain(imageUrl: string): Promise<TerrainData> {
  let promise = cache.get(imageUrl)
  if (!promise) {
    promise = (async () => {
      const [bounds, border, blob] = await Promise.all([
        fetch('/terrain/bounds.json').then((r) => r.json() as Promise<Bounds>),
        fetch('/terrain/border.json').then((r) => r.json() as Promise<[number, number][][]>),
        fetch(imageUrl).then((r) => r.blob()),
      ])
      const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
      const canvas = document.createElement('canvas')
      canvas.width = bitmap.width
      canvas.height = bitmap.height
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!
      ctx.drawImage(bitmap, 0, 0)
      const { data } = ctx.getImageData(0, 0, bitmap.width, bitmap.height)
      const n = bitmap.width * bitmap.height
      const heights = new Float32Array(n)
      const mask = new Float32Array(n)
      const range = bounds.elevationMax - bounds.elevationMin
      for (let i = 0; i < n; i++) {
        const v = (data[i * 4] * 256 + data[i * 4 + 1]) / 65535
        heights[i] = bounds.elevationMin + v * range
        mask[i] = data[i * 4 + 2] / 255
      }
      bitmap.close()
      return { bounds, heights, mask, width: canvas.width, height: canvas.height, border }
    })()
    cache.set(imageUrl, promise)
  }
  return promise
}
