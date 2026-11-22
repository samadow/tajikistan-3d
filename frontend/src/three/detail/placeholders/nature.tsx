import { useMemo } from 'react'
import { Mountain, rng, Water } from './common'

export function Lake() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.06} receiveShadow>
        <circleGeometry args={[1.9, 64]} />
        <Water />
      </mesh>
      <Mountain position={[-2.2, 0, -1.6]} scale={[1.6, 2.6, 1.4]} seed={3} />
      <Mountain position={[1.4, 0, -2.4]} scale={[1.9, 3.1, 1.3]} seed={7} />
      <Mountain position={[2.6, 0, 0.6]} scale={[1.1, 1.9, 1.4]} seed={11} />
      <Mountain position={[-2.7, 0, 1.1]} scale={[1, 1.4, 1.2]} seed={13} snowLine={1.2} />
    </group>
  )
}

export function Lakes() {
  // Seven lakes stepping down a valley.
  const lakes = useMemo(() => Array.from({ length: 7 }, (_, i) => ({ x: -2.4 + i * 0.8, z: Math.sin(i * 0.9) * 0.6, r: 0.28 + (i % 3) * 0.06, y: 0.9 - i * 0.13 })), [])
  return (
    <group>
      {lakes.map((l, i) => (
        <group key={i} position={[l.x, l.y, l.z]}>
          <mesh position-y={-l.y / 2} receiveShadow>
            <cylinderGeometry args={[l.r + 0.18, l.r + 0.3, l.y, 20]} />
            <meshStandardMaterial color="#5d6b45" roughness={0.95} />
          </mesh>
          <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
            <circleGeometry args={[l.r, 32]} />
            <meshStandardMaterial color={i % 2 ? '#2f9fb8' : '#2a7fb0'} roughness={0.05} metalness={0.3} />
          </mesh>
        </group>
      ))}
      <Mountain position={[-1, 0, -2.2]} scale={[2.6, 2.4, 1.2]} seed={21} snowLine={0.85} />
      <Mountain position={[1.6, 0, 2]} scale={[2.2, 1.6, 1]} seed={23} snowLine={1.2} />
    </group>
  )
}

export function Reservoir() {
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[-0.6, 0.5, -0.3]} receiveShadow>
        <circleGeometry args={[2, 48]} />
        <Water />
      </mesh>
      {/* curved dam */}
      <mesh position={[1.2, 0.55, 0.6]} rotation-y={-0.7} castShadow receiveShadow>
        <cylinderGeometry args={[1.8, 1.8, 1.1, 32, 1, true, -0.5, 1]} />
        <meshStandardMaterial color="#b9b2a6" roughness={0.7} side={2} />
      </mesh>
      <Mountain position={[-2.4, 0, -1.2]} scale={[1.4, 2.1, 1.8]} seed={31} snowLine={1.2} />
      <Mountain position={[0.4, 0, -2.6]} scale={[2, 2.4, 1.1]} seed={37} snowLine={0.9} />
    </group>
  )
}

export function Peak() {
  return (
    <group>
      <Mountain position={[0, 0, 0]} scale={[2.6, 4.6, 2.4]} seed={5} snowLine={0.55} />
      <Mountain position={[-2.2, 0, 1]} scale={[1.4, 2.4, 1.4]} seed={9} snowLine={0.65} />
      <Mountain position={[2, 0, 1.4]} scale={[1.3, 2, 1.2]} seed={17} snowLine={0.7} />
    </group>
  )
}

export function Road() {
  const points = useMemo(() => Array.from({ length: 40 }, (_, i) => {
    const t = i / 39
    return [-2.6 + t * 5.2, 0.05, Math.sin(t * Math.PI * 3) * 1.1] as const
  }), [])
  return (
    <group>
      {points.slice(0, -1).map(([x, y, z], i) => {
        const [nx, , nz] = points[i + 1]
        const len = Math.hypot(nx - x, nz - z)
        return (
          <mesh key={i} position={[(x + nx) / 2, y, (z + nz) / 2]} rotation-y={-Math.atan2(nz - z, nx - x)} receiveShadow>
            <boxGeometry args={[len + 0.02, 0.04, 0.18]} />
            <meshStandardMaterial color="#3a3836" roughness={0.9} />
          </mesh>
        )
      })}
      <Mountain position={[-1.4, 0, -2.2]} scale={[2, 2.4, 1.1]} seed={41} snowLine={0.75} />
      <Mountain position={[1.8, 0, 2.3]} scale={[1.8, 2, 1]} seed={43} snowLine={0.8} />
      <Mountain position={[2.4, 0, -1.8]} scale={[1.2, 1.6, 1]} seed={47} snowLine={0.8} />
    </group>
  )
}

/** A mountain range or a protected area: a chain of peaks along a ridge. */
export function Range() {
  const peaks = useMemo(() => {
    const rand = rng(77)
    return Array.from({ length: 7 }, (_, i) => ({
      x: -3 + i * 1.0 + (rand() - 0.5) * 0.4,
      z: Math.sin(i * 1.1) * 0.9,
      h: 1.6 + rand() * 1.8,
      w: 0.9 + rand() * 0.5,
      seed: 100 + i,
    }))
  }, [])
  return (
    <group>
      {peaks.map((p) => (
        <Mountain key={p.seed} position={[p.x, 0, p.z]} scale={[p.w, p.h, p.w]} seed={p.seed} snowLine={0.62} />
      ))}
      <mesh rotation-x={-Math.PI / 2} position={[0.6, 0.04, 2.2]}>
        <circleGeometry args={[0.55, 32]} />
        <Water />
      </mesh>
    </group>
  )
}
