import { Html } from '@react-three/drei'
import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AdditiveBlending,
  Color,
  CylinderGeometry,
  InstancedMesh,
  MathUtils,
  MeshBasicMaterial,
  Object3D,
  OctahedronGeometry,
  RingGeometry,
} from 'three'
import { useCategories } from '../../api/hooks'
import type { LandmarkMapItem } from '../../api/types'
import type { TerrainData } from '../../lib/geo'
import { useAppStore } from '../../store/useAppStore'
import { terrainHeightAt } from '../terrain/mesh'

const GOLD = new Color('#f2c46b')
const HEAD_Y = 2.4
const dummy = new Object3D()
const tmpColor = new Color()

/**
 * All landmark markers as four instanced meshes (heads, beams, pulse rings and
 * invisible hit cylinders): 4 draw calls however many landmarks there are.
 */
export function Markers({ landmarks, terrain }: { landmarks: LandmarkMapItem[]; terrain: TerrainData }) {
  const navigate = useNavigate()
  const { data: categories } = useCategories()
  const heads = useRef<InstancedMesh>(null)
  const beams = useRef<InstancedMesh>(null)
  const rings = useRef<InstancedMesh>(null)
  const hits = useRef<InstancedMesh>(null)
  const hover = useAppStore((s) => s.hover)
  const hoveredSlug = useAppStore((s) => s.hoveredSlug)
  const selectedSlug = useAppStore((s) => s.selectedSlug)
  const storyActiveSlug = useAppStore((s) => (s.mode === 'story' ? s.selectedSlug : null))
  const category = useAppStore((s) => s.category)
  const count = landmarks.length

  const ground = useMemo(() => landmarks.map((lm) => terrainHeightAt(terrain, lm.position.x, lm.position.z)), [landmarks, terrain])
  const colors = useMemo(() => {
    const bySlug = Object.fromEntries((categories ?? []).map((c) => [c.slug, c.color]))
    return landmarks.map((lm) => new Color(bySlug[lm.category] ?? '#f2c46b'))
  }, [landmarks, categories])
  const scales = useRef<number[]>([])

  const geometries = useMemo(
    () => ({
      head: new OctahedronGeometry(0.32, 0),
      beam: new CylinderGeometry(0.025, 0.06, HEAD_Y, 8, 1, true),
      ring: new RingGeometry(0.22, 0.3, 48).rotateX(-Math.PI / 2),
      hit: new CylinderGeometry(0.6, 0.6, 3.4, 8),
    }),
    [],
  )
  const materials = useMemo(
    () => ({
      // Colours above 1.0 so bloom picks the heads up; instance colours tint them.
      head: new MeshBasicMaterial({ color: new Color(2.2, 2.2, 2.2), toneMapped: false }),
      beam: new MeshBasicMaterial({ color: GOLD, transparent: true, opacity: 0.55, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
      ring: new MeshBasicMaterial({ transparent: true, depthWrite: false, blending: AdditiveBlending, toneMapped: false }),
      hit: new MeshBasicMaterial({ visible: false }),
    }),
    [],
  )
  useLayoutEffect(
    () => () => {
      Object.values(geometries).forEach((g) => g.dispose())
      Object.values(materials).forEach((m) => m.dispose())
    },
    [geometries, materials],
  )

  useLayoutEffect(() => {
    if (!heads.current) return
    colors.forEach((c, i) => heads.current!.setColorAt(i, c))
    if (heads.current.instanceColor) heads.current.instanceColor.needsUpdate = true
  }, [colors])

  useFrame(({ camera, clock }, delta) => {
    if (!heads.current || !beams.current || !rings.current || !hits.current) return
    const time = clock.elapsedTime
    for (let i = 0; i < count; i++) {
      const lm = landmarks[i]
      const highlight = lm.slug === hoveredSlug || lm.slug === selectedSlug || lm.slug === storyActiveSlug
      const visible = !category || category === lm.category
      const x = lm.position.x
      const z = lm.position.z
      const y = ground[i]
      // Keep markers a similar size on screen regardless of zoom.
      const dist = camera.position.distanceTo(dummy.position.set(x, y, z))
      const target = visible ? MathUtils.clamp(dist / 40, 0.45, 2.2) * (highlight ? 1.35 : 1) : 0
      const s = (scales.current[i] = MathUtils.damp(scales.current[i] ?? 0, target, 8, delta))

      dummy.rotation.set(0, time * 0.6 + i, 0)
      dummy.position.set(x, y + (HEAD_Y + Math.sin(time * 1.6 + i) * 0.08) * s, z)
      dummy.scale.setScalar(s)
      dummy.updateMatrix()
      heads.current.setMatrixAt(i, dummy.matrix)

      dummy.rotation.set(0, 0, 0)
      dummy.position.set(x, y + (HEAD_Y / 2) * s, z)
      dummy.updateMatrix()
      beams.current.setMatrixAt(i, dummy.matrix)

      dummy.position.set(x, y + 1.6 * s, z)
      dummy.updateMatrix()
      hits.current.setMatrixAt(i, dummy.matrix)

      const t = (time * 0.6 + i * 0.37) % 1
      dummy.position.set(x, y + 0.05, z)
      dummy.scale.setScalar(s * (1 + t * 3))
      dummy.updateMatrix()
      rings.current.setMatrixAt(i, dummy.matrix)
      // Additive blending: a darker colour is a more transparent ring.
      rings.current.setColorAt(i, tmpColor.copy(colors[i]).multiplyScalar((1 - t) * 0.8))
    }
    for (const mesh of [heads.current, beams.current, rings.current, hits.current]) mesh.instanceMatrix.needsUpdate = true
    if (rings.current.instanceColor) rings.current.instanceColor.needsUpdate = true
  })

  const onMove = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    const lm = e.instanceId !== undefined ? landmarks[e.instanceId] : undefined
    if (lm && lm.slug !== hoveredSlug) hover(lm.slug)
    document.body.style.cursor = 'pointer'
  }
  const onOut = () => {
    hover(null)
    document.body.style.cursor = ''
  }
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation()
    const lm = e.instanceId !== undefined ? landmarks[e.instanceId] : undefined
    if (lm) navigate(`/place/${lm.slug}`)
  }

  const labelSlug = hoveredSlug ?? storyActiveSlug
  const labelIndex = labelSlug ? landmarks.findIndex((l) => l.slug === labelSlug) : -1
  const label = labelIndex >= 0 ? landmarks[labelIndex] : null

  return (
    <group>
      <instancedMesh ref={heads} args={[geometries.head, materials.head, count]} frustumCulled={false} />
      <instancedMesh ref={beams} args={[geometries.beam, materials.beam, count]} frustumCulled={false} />
      <instancedMesh ref={rings} args={[geometries.ring, materials.ring, count]} frustumCulled={false} />
      <instancedMesh
        ref={hits}
        args={[geometries.hit, materials.hit, count]}
        frustumCulled={false}
        onPointerMove={onMove}
        onPointerOut={onOut}
        onClick={onClick}
      />
      {label && (
        <Html
          position={[label.position.x, ground[labelIndex] + 3.2 * (scales.current[labelIndex] ?? 1), label.position.z]}
          center
          zIndexRange={[20, 0]}
          style={{ pointerEvents: 'none' }}
        >
          <div className="marker-label">
            <span className="marker-label__index">{String(labelIndex + 1).padStart(2, '0')}</span>
            <span className="marker-label__name">{label.name}</span>
            {label.subtitle && <span className="marker-label__sub">{label.subtitle}</span>}
          </div>
        </Html>
      )}
    </group>
  )
}
