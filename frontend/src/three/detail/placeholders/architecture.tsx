import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import type { Mesh } from 'three'
import { GOLD, rng, SAND, SAND_DARK, Sandstone, Tower, Water } from './common'

export function Fortress({ ruins }: { ruins: boolean }) {
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

export function Settlement({ ruins }: { ruins: boolean }) {
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

export function Stupa({ ruins }: { ruins: boolean }) {
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

export function Monument() {
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
