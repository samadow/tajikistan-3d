import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import projection from '../../../shared/projection.json'
import { deriveBounds, projectXZ, unprojectXZ, type Bounds } from './geo'

// The same fixtures are asserted by backend/apps/core/tests/test_geo.py (ADR-3).
const bounds = { ...projection, ...deriveBounds(projection) }

describe('projection contract', () => {
  it.each(projection.fixtures)('$name', (fx) => {
    const [x, z] = projectXZ(bounds, fx.lon, fx.lat)
    expect(x).toBeCloseTo(fx.x, 3)
    expect(z).toBeCloseTo(fx.z, 3)
    expect(fx.elevation * bounds.heightScale).toBeCloseTo(fx.y, 3)
  })

  it('unproject is the inverse of project', () => {
    for (const fx of projection.fixtures) {
      const [x, z] = projectXZ(bounds, fx.lon, fx.lat)
      const [lon, lat] = unprojectXZ(bounds, x, z)
      expect(lon).toBeCloseTo(fx.lon, 6)
      expect(lat).toBeCloseTo(fx.lat, 6)
    }
  })

  it('generated bounds.json matches the contract', () => {
    const file = resolve(__dirname, '../../public/terrain/bounds.json')
    const generated = JSON.parse(readFileSync(file, 'utf-8')) as Bounds
    expect(generated.lonMin).toBe(projection.lonMin)
    expect(generated.latMax).toBe(projection.latMax)
    expect(generated.mapDepth).toBeCloseTo(bounds.mapDepth, 4)
    expect(generated.heightScale).toBeCloseTo(bounds.heightScale, 8)
  })
})
