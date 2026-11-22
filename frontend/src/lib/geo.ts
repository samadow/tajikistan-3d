/**
 * Projection contract (ADR-3): identical maths in backend/apps/core/geo.py and
 * tools/terrain/build_heightmap.py. The runtime reads the generated
 * /terrain/bounds.json; tests check it against shared/projection.json fixtures.
 */

export interface Projection {
  lonMin: number
  lonMax: number
  latMin: number
  latMax: number
  mapWidth: number
  verticalExaggeration: number
}

export interface Bounds extends Projection {
  mapDepth: number
  heightScale: number
  elevationMin: number
  elevationMax: number
  attribution: string
}

const KM_PER_DEG = 111.32

/** Derived constants, computed exactly like the Python side. */
export function deriveBounds(p: Projection): Pick<Bounds, 'mapDepth' | 'heightScale'> {
  const latMid = (p.latMin + p.latMax) / 2
  const widthKm = (p.lonMax - p.lonMin) * KM_PER_DEG * Math.cos((latMid * Math.PI) / 180)
  const depthKm = (p.latMax - p.latMin) * KM_PER_DEG
  return {
    mapDepth: (p.mapWidth * depthKm) / widthKm,
    heightScale: p.verticalExaggeration / ((widthKm / p.mapWidth) * 1000),
  }
}

/** lon/lat → world x/z. +X east, −Z north. */
export function projectXZ(b: Pick<Bounds, 'lonMin' | 'lonMax' | 'latMin' | 'latMax' | 'mapWidth' | 'mapDepth'>, lon: number, lat: number): [number, number] {
  const u = (lon - b.lonMin) / (b.lonMax - b.lonMin)
  const v = (lat - b.latMin) / (b.latMax - b.latMin)
  return [(u - 0.5) * b.mapWidth, (0.5 - v) * b.mapDepth]
}

/** world x/z → [lon, lat]. */
export function unprojectXZ(b: Pick<Bounds, 'lonMin' | 'lonMax' | 'latMin' | 'latMax' | 'mapWidth' | 'mapDepth'>, x: number, z: number): [number, number] {
  return [b.lonMin + (x / b.mapWidth + 0.5) * (b.lonMax - b.lonMin), b.latMin + (0.5 - z / b.mapDepth) * (b.latMax - b.latMin)]
}

// --- Heightmaps ---------------------------------------------------------------

/** A decoded heightmap covering a lon/lat rectangle (the whole map or a detail patch). */
export interface HeightGrid {
  lonMin: number
  lonMax: number
  latMin: number
  latMax: number
  /** Elevation in metres, row-major, row 0 = north. */
  heights: Float32Array
  /** Country mask 0..1 (1 = inside Tajikistan). */
  mask: Float32Array
  width: number
  height: number
}

export interface TerrainData {
  bounds: Bounds
  grid: HeightGrid
  border: [number, number][][]
}

/** Bilinear sample at lon/lat (clamped to the grid). */
export function sampleGrid(g: HeightGrid, values: Float32Array, lon: number, lat: number): number {
  const u = Math.min(Math.max((lon - g.lonMin) / (g.lonMax - g.lonMin), 0), 1) * (g.width - 1)
  const v = Math.min(Math.max((g.latMax - lat) / (g.latMax - g.latMin), 0), 1) * (g.height - 1)
  const x0 = Math.floor(u)
  const y0 = Math.floor(v)
  const x1 = Math.min(x0 + 1, g.width - 1)
  const y1 = Math.min(y0 + 1, g.height - 1)
  const fx = u - x0
  const fy = v - y0
  const a = values[y0 * g.width + x0] * (1 - fx) + values[y0 * g.width + x1] * fx
  const c = values[y1 * g.width + x0] * (1 - fx) + values[y1 * g.width + x1] * fx
  return a * (1 - fy) + c * fy
}

/** World-space terrain height (scaled + exaggerated) at world x/z. */
export function sampleHeight(t: TerrainData, x: number, z: number): number {
  const [lon, lat] = unprojectXZ(t.bounds, x, z)
  return sampleGrid(t.grid, t.grid.heights, lon, lat) * t.bounds.heightScale
}

/**
 * Decodes an RGB heightmap PNG: R/G = 16-bit normalised height, B = mask.
 * colorSpaceConversion:'none' keeps the raw byte values intact.
 */
export async function decodeHeightmap(
  url: string,
  rect: { lonMin: number; lonMax: number; latMin: number; latMax: number },
  elevationMin: number,
  elevationMax: number,
): Promise<HeightGrid> {
  const blob = await fetch(url).then((r) => {
    if (!r.ok) throw new Error(`Heightmap ${url} → ${r.status}`)
    return r.blob()
  })
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none', premultiplyAlpha: 'none' })
  // Read the size before close(): a closed ImageBitmap reports 0 × 0.
  const { width, height } = bitmap
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(bitmap, 0, 0)
  bitmap.close()
  const { data } = ctx.getImageData(0, 0, width, height)
  const n = width * height
  const heights = new Float32Array(n)
  const mask = new Float32Array(n)
  const range = elevationMax - elevationMin
  for (let i = 0; i < n; i++) {
    heights[i] = elevationMin + ((data[i * 4] * 256 + data[i * 4 + 1]) / 65535) * range
    mask[i] = data[i * 4 + 2] / 255
  }
  return { lonMin: rect.lonMin, lonMax: rect.lonMax, latMin: rect.latMin, latMax: rect.latMax, heights, mask, width, height }
}

const terrainCache = new Map<string, Promise<TerrainData>>()

/** Loads the country heightmap + bounds + border once per image URL. */
export function loadTerrain(imageUrl: string): Promise<TerrainData> {
  let promise = terrainCache.get(imageUrl)
  if (!promise) {
    promise = (async () => {
      const [bounds, border] = await Promise.all([
        fetch('/terrain/bounds.json').then((r) => r.json() as Promise<Bounds>),
        fetch('/terrain/border.json').then((r) => r.json() as Promise<[number, number][][]>),
      ])
      const grid = await decodeHeightmap(imageUrl, bounds, bounds.elevationMin, bounds.elevationMax)
      return { bounds, grid, border }
    })()
    // Let a failed load be retried later instead of caching the rejection forever.
    promise.catch(() => terrainCache.delete(imageUrl))
    terrainCache.set(imageUrl, promise)
  }
  return promise
}

// --- Water & patches -----------------------------------------------------------

export interface WaterData {
  lakes: { name: string; area_km2: number; elevation: number; ring: [number, number][] }[]
  rivers: { name: string; length_km: number; line: [number, number][] }[]
}

export interface PatchInfo {
  lonMin: number
  lonMax: number
  latMin: number
  latMax: number
  elevationMin: number
  elevationMax: number
}

const jsonCache = new Map<string, Promise<unknown>>()
export function loadJSON<T>(url: string): Promise<T> {
  let promise = jsonCache.get(url)
  if (!promise) {
    promise = fetch(url).then((r) => {
      if (!r.ok) throw new Error(`${url} → ${r.status}`)
      return r.json()
    })
    promise.catch(() => jsonCache.delete(url))
    jsonCache.set(url, promise)
  }
  return promise as Promise<T>
}
