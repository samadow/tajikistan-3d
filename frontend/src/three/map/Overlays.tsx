/** Things draped on the relief: the country border, lakes and area outlines. */
import { Line } from '@react-three/drei'
import { useEffect, useMemo, useState } from 'react'
import { BufferGeometry, Shape, ShapeGeometry, Vector3 } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import type { LandmarkMapItem } from '../../api/types'
import { loadJSON, projectXZ, type TerrainData, type WaterData } from '../../lib/geo'
import { terrainHeightAt } from '../terrain/mesh'

const GOLD = '#f2c46b'

/** Projects a lon/lat path onto the relief, subdividing so it follows ridges and valleys. */
export function drape(t: TerrainData, path: [number, number][], lift = 0.08, step = 0.25): Vector3[] {
  const points: Vector3[] = []
  for (let i = 0; i < path.length - 1; i++) {
    const [ax, az] = projectXZ(t.bounds, path[i][0], path[i][1])
    const [bx, bz] = projectXZ(t.bounds, path[i + 1][0], path[i + 1][1])
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / step))
    for (let s = 0; s < steps; s++) {
      const x = ax + ((bx - ax) * s) / steps
      const z = az + ((bz - az) * s) / steps
      points.push(new Vector3(x, terrainHeightAt(t, x, z) + lift, z))
    }
  }
  const [lx, lz] = projectXZ(t.bounds, path[path.length - 1][0], path[path.length - 1][1])
  points.push(new Vector3(lx, terrainHeightAt(t, lx, lz) + lift, lz))
  return points
}

export function Border({ data }: { data: TerrainData }) {
  const rings = useMemo(() => data.border.map((ring) => drape(data, ring)), [data])
  return (
    <group>
      {rings.map((points, i) => (
        <group key={i}>
          <Line points={points} color={GOLD} lineWidth={1.6} transparent opacity={0.95} toneMapped={false} />
          <Line points={points} color="#d4a64a" lineWidth={6} transparent opacity={0.12} toneMapped={false} depthWrite={false} />
        </group>
      ))}
    </group>
  )
}

/**
 * Lakes larger than ~2 km² as flat, glossy water surfaces at their real level
 * (median DEM height inside the shoreline, computed by the terrain tool).
 */
export function Lakes({ data }: { data: TerrainData }) {
  const [water, setWater] = useState<WaterData | null>(null)
  useEffect(() => {
    loadJSON<WaterData>('/terrain/water.json').then(setWater, () => setWater(null))
  }, [])

  const geometry = useMemo(() => {
    if (!water) return null
    const parts: BufferGeometry[] = []
    for (const lake of water.lakes) {
      const pts = lake.ring.map(([lon, lat]) => projectXZ(data.bounds, lon, lat))
      // Shape lives in the XY plane; rotating −90° about X maps (x, y) → (x, 0, −y).
      const shape = new Shape(pts.map(([x, z]) => ({ x, y: -z }) as never))
      const geo = new ShapeGeometry(shape, 1)
      geo.rotateX(-Math.PI / 2)
      geo.translate(0, lake.elevation * data.bounds.heightScale + 0.025, 0)
      parts.push(geo)
    }
    if (!parts.length) return null
    const merged = mergeGeometries(parts)
    parts.forEach((p) => p.dispose())
    return merged
  }, [water, data])

  useEffect(() => () => geometry?.dispose(), [geometry])
  if (!geometry) return null
  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshStandardMaterial
        color="#2b7fae"
        emissive="#0b2a44"
        roughness={0.12}
        metalness={0.35}
        transparent
        opacity={0.88}
        polygonOffset
        polygonOffsetFactor={-2}
      />
    </mesh>
  )
}

/** Dashed gold outlines for landmarks that are areas (national parks, ranges). */
export function AreaOutlines({ data, landmarks }: { data: TerrainData; landmarks: LandmarkMapItem[] }) {
  const outlines = useMemo(() => {
    const result: { key: string; points: Vector3[] }[] = []
    for (const lm of landmarks) {
      const geom = lm.area_geojson
      if (!geom) continue
      const polygons = (geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates) as [number, number][][][]
      polygons.forEach((poly, i) => result.push({ key: `${lm.slug}-${i}`, points: drape(data, poly[0], 0.12) }))
    }
    return result
  }, [data, landmarks])
  return (
    <group>
      {outlines.map((o) => (
        <Line key={o.key} points={o.points} color={GOLD} lineWidth={1.2} dashed dashSize={0.4} gapSize={0.25} transparent opacity={0.8} toneMapped={false} />
      ))}
    </group>
  )
}
