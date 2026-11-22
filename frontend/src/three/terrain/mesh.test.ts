import { describe, expect, it } from 'vitest'
import type { HeightGrid } from '../../lib/geo'
import { buildTerrainMesh, type MeshRequest } from './mesh'

const bounds = { lonMin: 0, lonMax: 10, latMin: 0, latMax: 5, mapWidth: 100, mapDepth: 50, heightScale: 0.001 }

function grid(fn: (u: number, v: number) => number, w = 11, h = 6, rect: { lonMin: number; lonMax: number; latMin: number; latMax: number } = bounds): HeightGrid {
  const heights = new Float32Array(w * h)
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) heights[r * w + c] = fn(c / (w - 1), r / (h - 1))
  return { ...rect, heights, mask: new Float32Array(w * h).fill(1), width: w, height: h }
}

describe('buildTerrainMesh', () => {
  it('produces a consistent indexed grid', () => {
    const req: MeshRequest = { bounds, base: grid(() => 1000), segments: 10, edgeFade: 0.0001 }
    const m = buildTerrainMesh(req)
    const vertices = m.positions.length / 3
    expect(vertices).toBe(11 * 6)
    expect(m.indices.length).toBe(10 * 5 * 6)
    expect(Math.max(...m.indices)).toBeLessThan(vertices)
    // Flat 1000 m plateau → y = 1 inside the map (edges always fade to 0), normals point up.
    const inner = 2 * 11 + 5
    expect(m.positions[inner * 3 + 1]).toBeCloseTo(1, 5)
    expect(m.normals[inner * 3 + 1]).toBeCloseTo(1, 5)
  })

  it('spans the whole map in world coordinates', () => {
    const m = buildTerrainMesh({ bounds, base: grid(() => 0), segments: 10, edgeFade: 1 })
    expect(m.positions[0]).toBeCloseTo(-50) // west
    expect(m.positions[2]).toBeCloseTo(-25) // north
    const last = m.positions.length - 3
    expect(m.positions[last]).toBeCloseTo(50)
    expect(m.positions[last + 2]).toBeCloseTo(25)
  })

  it('fades heights to zero at the map edges', () => {
    const m = buildTerrainMesh({ bounds, base: grid(() => 2000), segments: 10, edgeFade: 10 })
    expect(m.positions[1]).toBeCloseTo(0) // corner vertex
  })

  it('blends a detail patch into the base at its border', () => {
    const rect = { lonMin: 4, lonMax: 6, latMin: 2, latMax: 3 }
    const detail = grid(() => 3000, 9, 5, rect)
    const m = buildTerrainMesh({ bounds, base: grid(() => 1000), detail, rect, segments: 8, edgeFade: 0.0001 })
    const cols = 9
    const centre = ((m.positions.length / 3 - 1) / 2) | 0
    expect(m.positions[1]).toBeCloseTo(1) // border vertex = base height
    expect(m.positions[centre * 3 + 1]).toBeCloseTo(3) // interior = detail height
    expect(cols).toBe(9)
  })
})
