/**
 * Pure terrain-mesh builder, shared by the Web Worker and unit tests.
 * Produces a regular grid in world space with heights from a HeightGrid.
 */
import { projectXZ, sampleGrid, unprojectXZ, type Bounds, type HeightGrid, type TerrainData } from '../../lib/geo'

/** World units over which the map's outer edge eases down to sea level. */
export const EDGE_FADE = 3

/**
 * Terrain surface height at world x/z exactly as the mesh renders it (edge fade
 * included). Markers, the border line and the camera all use this, so nothing
 * floats above or sinks into the relief.
 */
export function terrainHeightAt(t: TerrainData, x: number, z: number): number {
  const [lon, lat] = unprojectXZ(t.bounds, x, z)
  return baseHeight({ bounds: t.bounds, base: t.grid, segments: 0, edgeFade: EDGE_FADE }, lon, lat)
}

export interface MeshArrays {
  positions: Float32Array
  normals: Float32Array
  uvs: Float32Array
  indices: Uint32Array
}

export interface MeshRequest {
  bounds: Pick<Bounds, 'lonMin' | 'lonMax' | 'latMin' | 'latMax' | 'mapWidth' | 'mapDepth' | 'heightScale'>
  /** The country-wide grid; always used (for the map, and to blend a patch's edges into it). */
  base: HeightGrid
  /** Optional high-resolution grid covering `rect` (a detail patch). */
  detail?: HeightGrid
  /** Area to mesh, lon/lat. Defaults to the whole map. */
  rect?: { lonMin: number; lonMax: number; latMin: number; latMax: number }
  segments: number
  /** Map edges ease down to zero height over this many world units. */
  edgeFade: number
}

const smooth = (t: number) => t * t * (3 - 2 * t)

/** Height (world units) of the country-wide terrain, including the map-edge fade. */
export function baseHeight(req: MeshRequest, lon: number, lat: number): number {
  const { bounds, base, edgeFade } = req
  const [x, z] = projectXZ(bounds, lon, lat)
  const edge = Math.min(bounds.mapWidth / 2 - Math.abs(x), bounds.mapDepth / 2 - Math.abs(z))
  const fade = smooth(Math.min(Math.max(edge / edgeFade, 0), 1))
  return sampleGrid(base, base.heights, lon, lat) * bounds.heightScale * fade
}

export function buildTerrainMesh(req: MeshRequest): MeshArrays {
  const { bounds, detail } = req
  const rect = req.rect ?? bounds
  const segX = Math.max(2, Math.round(req.segments))
  const [x0, z0] = projectXZ(bounds, rect.lonMin, rect.latMax) // north-west corner
  const [x1, z1] = projectXZ(bounds, rect.lonMax, rect.latMin) // south-east corner
  const segZ = Math.max(2, Math.round(segX * ((z1 - z0) / (x1 - x0))))
  const cols = segX + 1
  const rows = segZ + 1
  const count = cols * rows

  const positions = new Float32Array(count * 3)
  const uvs = new Float32Array(count * 2)
  const heights = new Float32Array(count)

  for (let r = 0; r < rows; r++) {
    const v = r / segZ // 0 = north
    const lat = rect.latMax - v * (rect.latMax - rect.latMin)
    for (let c = 0; c < cols; c++) {
      const u = c / segX
      const lon = rect.lonMin + u * (rect.lonMax - rect.lonMin)
      let y = baseHeight(req, lon, lat)
      if (detail) {
        // Blend the patch into the base terrain over the outer 15 % so there is no seam.
        const edge = Math.min(u, 1 - u, v, 1 - v)
        const w = smooth(Math.min(edge / 0.15, 1))
        const d = sampleGrid(detail, detail.heights, lon, lat) * bounds.heightScale
        y = y + (d - y) * w
      }
      const i = r * cols + c
      heights[i] = y
      positions[i * 3] = x0 + u * (x1 - x0)
      positions[i * 3 + 1] = y
      positions[i * 3 + 2] = z0 + v * (z1 - z0)
      uvs[i * 2] = u
      uvs[i * 2 + 1] = 1 - v
    }
  }

  // Normals from central differences of the height field (cheaper than face averaging).
  const normals = new Float32Array(count * 3)
  const dx = (x1 - x0) / segX
  const dz = (z1 - z0) / segZ
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const hl = heights[r * cols + Math.max(c - 1, 0)]
      const hr = heights[r * cols + Math.min(c + 1, segX)]
      const hu = heights[Math.max(r - 1, 0) * cols + c]
      const hd = heights[Math.min(r + 1, segZ) * cols + c]
      const nx = (hl - hr) / (2 * dx)
      const nz = (hu - hd) / (2 * dz)
      const len = Math.hypot(nx, 1, nz)
      const i = (r * cols + c) * 3
      normals[i] = nx / len
      normals[i + 1] = 1 / len
      normals[i + 2] = nz / len
    }
  }

  const indices = new Uint32Array(segX * segZ * 6)
  let k = 0
  for (let r = 0; r < segZ; r++) {
    for (let c = 0; c < segX; c++) {
      const a = r * cols + c
      const b = a + 1
      const d = a + cols
      const e = d + 1
      indices[k++] = a
      indices[k++] = d
      indices[k++] = b
      indices[k++] = b
      indices[k++] = d
      indices[k++] = e
    }
  }
  return { positions, normals, uvs, indices }
}
