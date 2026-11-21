/**
 * Stylised procedural stand-ins, one per kind of place, shown until a real GLB
 * is uploaded in the Django admin. They are deliberately abstract (a "model
 * railway" look in sandstone and gold) so nobody mistakes them for a faithful
 * reconstruction. Everything fits roughly inside a 5 × 5 unit footprint.
 */
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef, type ReactNode } from 'react'
import { BufferAttribute, IcosahedronGeometry, MathUtils, type Group, type Mesh } from 'three'
import type { PlaceholderKind } from '../../api/types'

const SAND = '#c9a46a'
const SAND_DARK = '#9c7a4a'
const WATER = '#2a7fb0'
const GOLD = '#d4a64a'

/** Deterministic pseudo-random numbers so placeholders look the same every visit. */
function rng(seed: number) {
  let s = seed
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

function Sandstone(props: { color?: string }) {
  return <meshStandardMaterial color={props.color ?? SAND} roughness={0.85} metalness={0.05} />
}

function Water() {
  return <meshStandardMaterial color={WATER} roughness={0.08} metalness={0.3} envMapIntensity={1.4} />
}

/** A low mountain made from a noisy icosahedron; snow above `snowLine` (0..1). */
function Mountain({ position, scale, seed, snowLine = 0.7 }: { position: [number, number, number]; scale: [number, number, number]; seed: number; snowLine?: number }) {
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
  return (
    <mesh geometry={geometry} position={position} scale={scale} castShadow receiveShadow>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  )
}

function Tower({ position, height, radius = 0.38, broken = false }: { position: [number, number, number]; height: number; radius?: number; broken?: boolean }) {
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

function Fortress({ ruins }: { ruins: boolean }) {
  const half = 2
  const wallH = ruins ? 0.55 : 0.95
  const walls: [number, number, number, number, number][] = [
    // x, z, length, rotationY, gap (front wall has a gate)
    [0, -half, half * 2, 0, 0],
    [-half, 0, half * 2, Math.PI / 2, 0],
    [half, 0, half * 2, Math.PI / 2, 0],
  ]
  return (
    <group>
      {walls.map(([x, z, len, rot], i) => (
        <mesh key={i} position={[x, wallH / 2, z]} rotation-y={rot} castShadow receiveShadow>
          <boxGeometry args={[len, wallH, 0.28]} />
          <Sandstone />
        </mesh>
      ))}
      {/* front wall split by the gate */}
      {[-1.25, 1.25].map((x) => (
        <mesh key={x} position={[x, wallH / 2, half]} castShadow receiveShadow>
          <boxGeometry args={[1.5, wallH, 0.28]} />
          <Sandstone />
        </mesh>
      ))}
      {/* gate towers + arch */}
      <Tower position={[-0.45, 0, half]} height={1.35} radius={0.26} broken={ruins} />
      <Tower position={[0.45, 0, half]} height={1.35} radius={0.26} broken={ruins} />
      {!ruins && (
        <mesh position={[0, 1.0, half]} rotation-x={Math.PI / 2}>
          <torusGeometry args={[0.3, 0.07, 8, 16, Math.PI]} />
          <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} />
        </mesh>
      )}
      {[
        [-half, -half],
        [half, -half],
        [-half, half],
        [half, half],
      ].map(([x, z], i) => (
        <Tower key={i} position={[x, 0, z]} height={1.6} broken={ruins && i % 2 === 0} />
      ))}
      {/* citadel */}
      <mesh position={[0.6, ruins ? 0.3 : 0.5, -0.7]} castShadow receiveShadow>
        <boxGeometry args={[1.4, ruins ? 0.6 : 1, 1.2]} />
        <Sandstone color={SAND_DARK} />
      </mesh>
    </group>
  )
}

function Settlement({ ruins }: { ruins: boolean }) {
  const houses = useMemo(() => {
    const rand = rng(42)
    const list: { x: number; z: number; w: number; d: number; h: number }[] = []
    for (let gx = -3; gx <= 3; gx++)
      for (let gz = -3; gz <= 3; gz++) {
        if (Math.hypot(gx, gz) > 3.3 || rand() < 0.2) continue
        list.push({ x: gx * 0.62 + (rand() - 0.5) * 0.1, z: gz * 0.62 + (rand() - 0.5) * 0.1, w: 0.4 + rand() * 0.15, d: 0.4 + rand() * 0.15, h: 0.25 + rand() * 0.2 })
      }
    return list
  }, [])
  return (
    <group>
      {houses.map((b, i) =>
        ruins ? (
          // Ruins: only the outline of walls remains.
          <group key={i} position={[b.x, 0, b.z]}>
            {[
              [0, -b.d / 2, b.w, 0.05],
              [0, b.d / 2, b.w, 0.05],
              [-b.w / 2, 0, 0.05, b.d],
              [b.w / 2, 0, 0.05, b.d],
            ].map(([x, z, w, d], j) => (
              <mesh key={j} position={[x, 0.06, z]} receiveShadow>
                <boxGeometry args={[w, 0.12, d]} />
                <Sandstone color={SAND_DARK} />
              </mesh>
            ))}
          </group>
        ) : (
          <mesh key={i} position={[b.x, b.h / 2, b.z]} castShadow receiveShadow>
            <boxGeometry args={[b.w, b.h, b.d]} />
            <Sandstone />
          </mesh>
        ),
      )}
      {!ruins && (
        <mesh position={[0, 0.35, 0]} castShadow>
          <cylinderGeometry args={[0.35, 0.45, 0.7, 16]} />
          <Sandstone color={SAND_DARK} />
        </mesh>
      )}
    </group>
  )
}

function Lake() {
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

function Lakes() {
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

function Reservoir() {
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

function Peak() {
  return (
    <group>
      <Mountain position={[0, 0, 0]} scale={[2.6, 4.6, 2.4]} seed={5} snowLine={0.55} />
      <Mountain position={[-2.2, 0, 1]} scale={[1.4, 2.4, 1.4]} seed={9} snowLine={0.65} />
      <Mountain position={[2, 0, 1.4]} scale={[1.3, 2, 1.2]} seed={17} snowLine={0.7} />
    </group>
  )
}

function Road() {
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

function Stupa({ ruins }: { ruins: boolean }) {
  return (
    <group>
      {[3.6, 2.8, 2.0].map((size, i) => (
        <mesh key={size} position-y={0.2 + i * 0.4} castShadow receiveShadow>
          <boxGeometry args={[size, 0.4, size]} />
          <Sandstone color={i % 2 ? SAND_DARK : SAND} />
        </mesh>
      ))}
      {!ruins && (
        <>
          <mesh position-y={1.4} castShadow>
            <sphereGeometry args={[0.85, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <Sandstone />
          </mesh>
          <mesh position-y={2.6}>
            <coneGeometry args={[0.18, 0.9, 12]} />
            <meshStandardMaterial color={GOLD} metalness={0.8} roughness={0.25} />
          </mesh>
        </>
      )}
      {/* courtyard cells */}
      {Array.from({ length: 10 }, (_, i) => {
        const a = (i / 10) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 2.6, 0.18, Math.sin(a) * 2.6]} receiveShadow>
            <boxGeometry args={[0.5, ruins ? 0.18 : 0.36, 0.5]} />
            <Sandstone color={SAND_DARK} />
          </mesh>
        )
      })}
    </group>
  )
}

function Monument() {
  const crown = useRef<Mesh>(null)
  useFrame((_, dt) => {
    if (crown.current) crown.current.rotation.y += dt * 0.4
  })
  return (
    <group>
      {/* arch */}
      <mesh position={[0, 0.9, -0.6]} castShadow>
        <torusGeometry args={[1, 0.16, 12, 32, Math.PI]} />
        <meshStandardMaterial color={GOLD} metalness={0.85} roughness={0.25} />
      </mesh>
      {[-1, 1].map((x) => (
        <mesh key={x} position={[x, 0.45, -0.6]} castShadow>
          <boxGeometry args={[0.3, 0.9, 0.3]} />
          <Sandstone color="#e8dcc5" />
        </mesh>
      ))}
      {/* figure on a pedestal */}
      <mesh position={[0, 0.3, -0.6]} castShadow>
        <boxGeometry args={[0.5, 0.6, 0.5]} />
        <Sandstone color="#e8dcc5" />
      </mesh>
      <mesh position={[0, 0.95, -0.6]} castShadow>
        <capsuleGeometry args={[0.12, 0.5, 4, 12]} />
        <meshStandardMaterial color="#8c6a3a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh ref={crown} position={[0, 2.05, -0.6]}>
        <octahedronGeometry args={[0.22, 0]} />
        <meshStandardMaterial color={GOLD} emissive={GOLD} emissiveIntensity={0.6} metalness={0.9} roughness={0.2} />
      </mesh>
      {/* palace block with columns */}
      <mesh position={[0, 0.35, 1.5]} castShadow receiveShadow>
        <boxGeometry args={[3.6, 0.7, 1]} />
        <Sandstone color="#efe6d4" />
      </mesh>
      {Array.from({ length: 9 }, (_, i) => (
        <mesh key={i} position={[-1.6 + i * 0.4, 0.85, 0.95]} castShadow>
          <cylinderGeometry args={[0.06, 0.06, 0.3, 8]} />
          <meshStandardMaterial color={GOLD} metalness={0.7} roughness={0.3} />
        </mesh>
      ))}
      <mesh position={[0, 0.06, 0.4]} rotation-x={-Math.PI / 2}>
        <planeGeometry args={[1.2, 1.6]} />
        <Water />
      </mesh>
    </group>
  )
}

/** Round plinth with a gold ornament ring that every model stands on. */
export function Plinth({ children }: { children?: ReactNode }) {
  return (
    <group>
      <mesh position-y={-0.2} receiveShadow>
        <cylinderGeometry args={[4.2, 4.4, 0.4, 96]} />
        <meshStandardMaterial color="#121a36" roughness={0.6} metalness={0.2} />
      </mesh>
      <mesh position-y={0.001} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[4.05, 4.15, 96]} />
        <meshStandardMaterial color={GOLD} metalness={0.9} roughness={0.25} />
      </mesh>
      <mesh position-y={0.002} rotation-x={-Math.PI / 2} receiveShadow>
        <circleGeometry args={[4.05, 96]} />
        <meshStandardMaterial color="#1a2347" roughness={0.9} />
      </mesh>
      {children}
    </group>
  )
}

export function PlaceholderModel({ kind, variant }: { kind: PlaceholderKind; variant?: 'restored' | 'ruins' }) {
  const ruins = variant === 'ruins'
  const group = useRef<Group>(null)
  // Gentle "grow" animation on mount; callers pass a `key` so it replays when the era changes.
  const grow = useRef(0)
  useFrame((_, dt) => {
    grow.current = MathUtils.damp(grow.current, 1, 4, dt)
    if (group.current) group.current.scale.set(1, grow.current, 1)
  })
  const content = (() => {
    switch (kind) {
      case 'fortress':
        return <Fortress ruins={ruins} />
      case 'settlement':
        return <Settlement ruins={ruins} />
      case 'lake':
        return <Lake />
      case 'lakes':
        return <Lakes />
      case 'reservoir':
        return <Reservoir />
      case 'peak':
        return <Peak />
      case 'road':
        return <Road />
      case 'stupa':
        return <Stupa ruins={ruins} />
      case 'monument':
      default:
        return <Monument />
    }
  })()
  return (
    <group ref={group} scale-y={0}>
      {content}
    </group>
  )
}
