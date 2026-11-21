import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AdditiveBlending, Color, MathUtils, type Group, type Mesh, type MeshBasicMaterial } from 'three'
import { useCategories } from '../../api/hooks'
import type { LandmarkSummary } from '../../api/types'
import { sampleHeight, type TerrainData } from '../../lib/geo'
import { useAppStore } from '../../store/useAppStore'

const GOLD = '#f2c46b'

export function Markers({ landmarks, terrain }: { landmarks: LandmarkSummary[]; terrain: TerrainData }) {
  const { data: categories } = useCategories()
  const colors = useMemo(() => Object.fromEntries((categories ?? []).map((c) => [c.slug, c.color])), [categories])
  return (
    <group>
      {landmarks.map((lm, i) => (
        <Marker
          key={lm.slug}
          landmark={lm}
          index={i}
          color={colors[lm.category] ?? GOLD}
          groundY={sampleHeight(terrain, lm.position.x, lm.position.z)}
        />
      ))}
    </group>
  )
}

function Marker({
  landmark,
  index,
  color,
  groundY,
}: {
  landmark: LandmarkSummary
  index: number
  color: string
  groundY: number
}) {
  const navigate = useNavigate()
  const group = useRef<Group>(null)
  const ring = useRef<Mesh>(null)
  const head = useRef<Mesh>(null)
  const hovered = useAppStore((s) => s.hoveredSlug === landmark.slug)
  const selected = useAppStore((s) => s.selectedSlug === landmark.slug)
  const storyActive = useAppStore((s) => s.mode === 'story' && s.storyIndex === index + 1)
  const visible = useAppStore((s) => !s.category || s.category === landmark.category)
  const hover = useAppStore((s) => s.hover)
  const headColor = useMemo(() => new Color(color).multiplyScalar(2.2), [color]) // > 1 so bloom picks it up
  const scale = useRef(0)
  const highlight = hovered || selected || storyActive

  useFrame(({ camera, clock }, delta) => {
    if (!group.current) return
    // Keep markers a similar size on screen regardless of zoom.
    const dist = camera.position.distanceTo(group.current.position)
    const target = visible ? MathUtils.clamp(dist / 40, 0.45, 2.2) * (highlight ? 1.35 : 1) : 0
    scale.current = MathUtils.damp(scale.current, target, 8, delta)
    group.current.scale.setScalar(scale.current)
    group.current.visible = scale.current > 0.01

    const t = (clock.elapsedTime * 0.6 + index * 0.37) % 1
    if (ring.current) {
      ring.current.scale.setScalar(1 + t * 3)
      ;(ring.current.material as MeshBasicMaterial).opacity = (1 - t) * 0.7
    }
    if (head.current) head.current.position.y = 2.4 + Math.sin(clock.elapsedTime * 1.6 + index) * 0.08
  })

  const open = () => navigate(`/place/${landmark.slug}`)

  return (
    <group ref={group} position={[landmark.position.x, groundY, landmark.position.z]}>
      {/* pulse on the ground */}
      <mesh ref={ring} rotation-x={-Math.PI / 2} position-y={0.05}>
        <ringGeometry args={[0.22, 0.3, 48]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      {/* beam */}
      <mesh position-y={1.2}>
        <cylinderGeometry args={[0.025, 0.06, 2.4, 8, 1, true]} />
        <meshBasicMaterial color={GOLD} transparent opacity={0.55} depthWrite={false} blending={AdditiveBlending} toneMapped={false} />
      </mesh>
      {/* glowing head */}
      <mesh ref={head} position-y={2.4}>
        <octahedronGeometry args={[0.32, 0]} />
        <meshBasicMaterial color={headColor} toneMapped={false} />
      </mesh>
      {/* generous invisible hit area for touch */}
      <mesh
        position-y={1.6}
        onPointerOver={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation()
          hover(landmark.slug)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          hover(null)
          document.body.style.cursor = ''
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          open()
        }}
      >
        <cylinderGeometry args={[0.6, 0.6, 3.4, 8]} />
        <meshBasicMaterial visible={false} />
      </mesh>
      {highlight && (
        <Html position={[0, 3, 0]} center zIndexRange={[20, 0]} style={{ pointerEvents: 'none' }}>
          <div className="marker-label">
            <span className="marker-label__index">{String(index + 1).padStart(2, '0')}</span>
            <span className="marker-label__name">{landmark.name}</span>
            {landmark.subtitle && <span className="marker-label__sub">{landmark.subtitle}</span>}
          </div>
        </Html>
      )}
    </group>
  )
}
