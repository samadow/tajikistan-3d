import { Line } from '@react-three/drei'
import { useEffect, useMemo } from 'react'
import { BufferAttribute, Color, PlaneGeometry, Vector3 } from 'three'
import { projectXZ, sampleHeight, type TerrainData } from '../../lib/geo'
import { registerTerrain } from '../camera/director'

// Elevation ramps (metres → colour). Inside Tajikistan: warm, natural tones with
// snow on the high Pamirs. Outside: muted ink-blue so the country glows on the map.
const INSIDE: [number, string][] = [
  [200, '#3f5a33'],
  [900, '#6f7340'],
  [1800, '#9a7c4f'],
  [2800, '#8a6f58'],
  [3800, '#7d7066'],
  [4700, '#9b948f'],
  [5300, '#e9e6df'],
  [6000, '#fbf9f4'],
]
const OUTSIDE: [number, string][] = [
  [200, '#0d1733'],
  [1500, '#18234a'],
  [3500, '#27325c'],
  [5000, '#4a5582'],
]
const ROCK = new Color('#4e463f')

function makeRamp(stops: [number, string][]) {
  const parsed = stops.map(([h, c]) => [h, new Color(c)] as const)
  return (h: number, out: Color) => {
    if (h <= parsed[0][0]) return out.copy(parsed[0][1])
    for (let i = 1; i < parsed.length; i++) {
      const [h1, c1] = parsed[i]
      if (h <= h1) {
        const [h0, c0] = parsed[i - 1]
        return out.copy(c0).lerp(c1, (h - h0) / (h1 - h0))
      }
    }
    return out.copy(parsed[parsed.length - 1][1])
  }
}
const insideRamp = makeRamp(INSIDE)
const outsideRamp = makeRamp(OUTSIDE)

/** Builds the displaced, vertex-coloured relief mesh from the decoded heightmap. */
function buildGeometry(t: TerrainData, detail: number): PlaneGeometry {
  const { mapWidth, mapDepth, heightScale } = t.bounds
  const segX = Math.round(t.width * 0.5 * detail)
  const segZ = Math.round(segX * (mapDepth / mapWidth))
  const geo = new PlaneGeometry(mapWidth, mapDepth, segX, segZ)
  geo.rotateX(-Math.PI / 2)

  const pos = geo.attributes.position as BufferAttribute
  const metres = new Float32Array(pos.count)
  const masks = new Float32Array(pos.count)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    // Ease heights down near the edges so the map melts into the ground plane.
    const edge = Math.min(mapWidth / 2 - Math.abs(x), mapDepth / 2 - Math.abs(z))
    const fade = Math.min(Math.max(edge / 3, 0), 1)
    const y = sampleHeight(t, x, z) * (fade * fade * (3 - 2 * fade))
    pos.setY(i, y)
    metres[i] = y / heightScale
    // Nearest mask sample is fine here; the mask is already blurred.
    const u = Math.round((x / mapWidth + 0.5) * (t.width - 1))
    const v = Math.round((z / mapDepth + 0.5) * (t.height - 1))
    masks[i] = t.mask[v * t.width + u]
  }
  geo.computeVertexNormals()

  const normals = geo.attributes.normal as BufferAttribute
  const colors = new Float32Array(pos.count * 3)
  const inside = new Color()
  const outside = new Color()
  for (let i = 0; i < pos.count; i++) {
    const h = metres[i]
    const steep = 1 - normals.getY(i) // 0 = flat, ~1 = cliff
    insideRamp(h, inside)
    // Steep slopes show bare rock and shed snow.
    inside.lerp(ROCK, Math.min(Math.max((steep - 0.18) * 2.2, 0), 0.75))
    outsideRamp(h, outside)
    inside.lerp(outside, 1 - masks[i])
    colors.set([inside.r, inside.g, inside.b], i * 3)
  }
  geo.setAttribute('color', new BufferAttribute(colors, 3))
  return geo
}

export function Terrain({ data, detail }: { data: TerrainData; detail: number }) {
  const geometry = useMemo(() => buildGeometry(data, detail), [data, detail])
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => registerTerrain(data), [data])

  return (
    <group>
      <mesh geometry={geometry} receiveShadow>
        <meshStandardMaterial vertexColors roughness={0.92} metalness={0.02} />
      </mesh>
      {/* Endless ground so there is never a visible edge; fog fades it out. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.02}>
        <circleGeometry args={[900, 64]} />
        <meshStandardMaterial color="#0d1733" roughness={1} />
      </mesh>
    </group>
  )
}

/** Gold country border draped over the relief. */
export function Border({ data }: { data: TerrainData }) {
  const rings = useMemo(() => {
    return data.border.map((ring) => {
      const points: Vector3[] = []
      for (let i = 0; i < ring.length - 1; i++) {
        const [ax, az] = projectXZ(data.bounds, ring[i][0], ring[i][1])
        const [bx, bz] = projectXZ(data.bounds, ring[i + 1][0], ring[i + 1][1])
        // Subdivide so the line follows ridges and valleys instead of cutting through them.
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 0.25))
        for (let s = 0; s < steps; s++) {
          const x = ax + ((bx - ax) * s) / steps
          const z = az + ((bz - az) * s) / steps
          points.push(new Vector3(x, sampleHeight(data, x, z) + 0.08, z))
        }
      }
      points.push(points[0].clone())
      return points
    })
  }, [data])

  return (
    <group>
      {rings.map((points, i) => (
        <group key={i}>
          <Line points={points} color="#f2c46b" lineWidth={1.6} transparent opacity={0.95} toneMapped={false} />
          <Line points={points} color="#d4a64a" lineWidth={6} transparent opacity={0.12} toneMapped={false} />
        </group>
      ))}
    </group>
  )
}
