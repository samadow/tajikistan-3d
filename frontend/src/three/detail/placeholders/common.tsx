/**
 * Stylised procedural stand-ins, one per kind of place, shown until a real GLB
 * is uploaded in the Django admin. Deliberately abstract (a "model railway"
 * look in sandstone and gold) so nobody mistakes them for a faithful
 * reconstruction. Everything fits roughly inside a 5 × 5 unit footprint.
 */
import { useEffect, useMemo } from 'react'
import { BufferAttribute, IcosahedronGeometry } from 'three'

export const SAND = '#c9a46a'
export const SAND_DARK = '#9c7a4a'
export const WATER = '#2a7fb0'
export const GOLD = '#d4a64a'

export function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

export function Sandstone(props: { color?: string }) {
  return <meshStandardMaterial color={props.color ?? SAND} roughness={0.85} metalness={0.05} />
}

export function Water() {
  return <meshStandardMaterial color={WATER} roughness={0.08} metalness={0.3} envMapIntensity={1.4} />
}

/** A low mountain made from a noisy icosahedron; snow above `snowLine` (0..1). */

export function Mountain({ position, scale, seed, snowLine = 0.7 }: { position: [number, number, number]; scale: [number, number, number]; seed: number; snowLine?: number }) {
  const geometry = useMemo(() => {
    const geo = new IcosahedronGeometry(1, 3)
    const rand = rng(seed)
    const pos = geo.attributes.position
    const colors: number[] = []
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (y < 0) pos.setY(i, 0)
      const jitter = 0.85 + rand() * 0.3
      pos.setXYZ(i, pos.getX(i) * jitter, Math.max(0, pos.getY(i)) * (0.9 + rand() * 0.2), pos.getZ(i) * jitter)
      const h = pos.getY(i)
      const snow = h > snowLine ? 1 : 0
      colors.push(...(snow ? [0.92, 0.9, 0.86] : h > snowLine - 0.25 ? [0.35, 0.31, 0.28] : [0.45, 0.37, 0.27]))
    }
    geo.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3))
    geo.computeVertexNormals()
    return geo
  }, [seed, snowLine])
  useEffect(() => () => geometry.dispose(), [geometry])
  return (
    <mesh geometry={geometry} position={position} scale={scale} castShadow receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  )
}

export function Tower({ position, height, radius = 0.38, broken = false }: { position: [number, number, number]; height: number; radius?: number; broken?: boolean }) {
  const h = broken ? height * 0.55 : height
  return (
    <group position={position}>
      <mesh position-y={h / 2} castShadow receiveShadow>
        <cylinderGeometry args={[radius * 0.85, radius, h, 12]} />
        <Sandstone />
      </mesh>
      {!broken &&
        Array.from({ length: 8 }, (_, i) => {
          const a = (i / 8) * Math.PI * 2
          return (
            <mesh key={i} position={[Math.cos(a) * radius * 0.8, h + 0.08, Math.sin(a) * radius * 0.8]} castShadow>
              <boxGeometry args={[0.12, 0.16, 0.12]} />
              <Sandstone />
            </mesh>
          )
        })}
    </group>
  )
}
