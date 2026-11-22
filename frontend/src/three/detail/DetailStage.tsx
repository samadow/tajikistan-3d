import { ContactShadows, Environment, Html, Lightformer, useGLTF } from '@react-three/drei'
import { useThree, type ThreeEvent } from '@react-three/fiber'
import { useQueryClient } from '@tanstack/react-query'
import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Box3, Vector3, type Group, type Object3D } from 'three'
import { KTX2Loader } from 'three-stdlib'
import { api } from '../../api/client'
import { useLandmark, useLandmarks } from '../../api/hooks'
import type { Era, Hotspot, LandmarkDetail, ModelFile, PlaceholderKind } from '../../api/types'
import { formatYear, useT } from '../../i18n/strings'
import type { Quality } from '../../lib/device'
import { disposeObject } from '../../lib/dispose'
import { pickModel } from '../../lib/models'
import { useAppStore } from '../../store/useAppStore'
import { hotspotPositions } from './hotspotRegistry'
import { PlaceholderModel, Plinth } from './placeholders'

const DRACO_PATH = '/decoders/draco/'
const FIT_SIZE = 5 // uploaded models are fitted to this footprint on the plinth
const PICK_MODE = typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('pick')

let ktx2: KTX2Loader | null = null

/** useGLTF with local Draco, meshopt and KTX2 decoders. */
function useModel(url: string) {
  const gl = useThree((s) => s.gl)
  return useGLTF(url, DRACO_PATH, true, (loader) => {
    if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath('/decoders/basis/').detectSupport(gl)
    loader.setKTX2Loader(ktx2)
  })
}

/**
 * Centres and scales any uploaded GLB onto the plinth. Children (hotspots) are
 * rendered inside the same transform, so their coordinates are the model's own
 * coordinates as authored in Blender (fix for audit defect D1).
 */
function FittedGlb({ url, scale, children }: { url: string; scale: number; children?: ReactNode }) {
  const { scene } = useModel(url)
  const fit = useMemo(() => {
    const box = new Box3().setFromObject(scene)
    const size = box.getSize(new Vector3())
    const centre = box.getCenter(new Vector3())
    const s = (FIT_SIZE / Math.max(size.x, size.z, size.y * 0.8, 0.001)) * scale
    return { s, offset: new Vector3(-centre.x, -box.min.y, -centre.z) }
  }, [scene, scale])

  useEffect(() => {
    scene.traverse((o: Object3D & { isMesh?: boolean }) => {
      if (o.isMesh) {
        o.castShadow = true
        o.receiveShadow = true
      }
    })
    // Free GPU memory when this model leaves the stage.
    return () => {
      disposeObject(scene)
      useGLTF.clear(url)
    }
  }, [scene, url])

  return (
    <group scale={fit.s}>
      <group position={fit.offset}>
        <primitive object={scene} />
        {children}
      </group>
    </group>
  )
}

/** Falls back to the placeholder if a GLB fails to load (404, corrupt file…). */
class ModelBoundary extends Component<{ fallback: ReactNode; children: ReactNode; resetKey: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) this.setState({ failed: false })
  }
  componentDidCatch(error: unknown) {
    console.warn('Model failed to load, showing the placeholder instead.', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function HotspotPin({ hotspot, index }: { hotspot: Hotspot; index: number }) {
  const ref = useRef<Group>(null)
  const active = useAppStore((s) => s.activeHotspot === hotspot.id)
  const setActive = useAppStore((s) => s.setActiveHotspot)

  // Publish the world position so the camera can focus on it.
  useEffect(() => {
    const id = hotspot.id
    const update = () => {
      if (ref.current) hotspotPositions.set(id, { position: ref.current.getWorldPosition(new Vector3()), distance: hotspot.focus_distance })
    }
    update()
    const timer = setInterval(update, 500) // the fitted model may finish loading later
    return () => {
      clearInterval(timer)
      hotspotPositions.delete(id)
    }
  }, [hotspot.id, hotspot.focus_distance])

  return (
    <group ref={ref} position={[hotspot.position.x, hotspot.position.y, hotspot.position.z]}>
      <Html center zIndexRange={[30, 0]}>
        <button
          type="button"
          className={`hotspot__dot ${active ? 'is-active' : ''}`}
          aria-label={hotspot.title}
          aria-pressed={active}
          onClick={() => setActive(active ? null : hotspot.id)}
        >
          {index + 1}
        </button>
      </Html>
    </group>
  )
}

/** Dev helper: `?pick=1` shows the model-space coordinates of a click, to paste into the admin. */
function PickHelper({ children }: { children: ReactNode }) {
  const group = useRef<Group>(null)
  const [picked, setPicked] = useState<Vector3 | null>(null)
  if (!PICK_MODE) return <>{children}</>
  const onPick = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation()
    if (!group.current) return
    const local = group.current.worldToLocal(e.point.clone())
    setPicked(local)
    const text = `${local.x.toFixed(2)}, ${local.y.toFixed(2)}, ${local.z.toFixed(2)}`
    navigator.clipboard?.writeText(text).catch(() => undefined)
  }
  return (
    <group ref={group} onPointerDown={onPick}>
      {children}
      {picked && (
        <Html position={picked} center>
          <div className="marker-label">
            <span className="marker-label__index">x, y, z (copied)</span>
            <span className="marker-label__sub">{`${picked.x.toFixed(2)}, ${picked.y.toFixed(2)}, ${picked.z.toFixed(2)}`}</span>
          </div>
        </Html>
      )}
    </group>
  )
}

/** One model (GLB or placeholder) with its hotspots, in the model's own space. */
function ModelSlot({
  models,
  kind,
  variant,
  scale,
  quality,
  hotspots,
}: {
  models: ModelFile[]
  kind: PlaceholderKind
  variant?: Era['placeholder_variant']
  scale: number
  quality: Quality
  hotspots: Hotspot[]
}) {
  const model = pickModel(models, quality)
  const pins = hotspots.map((h, i) => <HotspotPin key={h.id} hotspot={h} index={i} />)
  const placeholder = (
    <group>
      <PlaceholderModel key={`${kind}-${variant}`} kind={kind} variant={variant} />
      {pins}
    </group>
  )
  if (!model) return <PickHelper>{placeholder}</PickHelper>
  return (
    <ModelBoundary fallback={placeholder} resetKey={model.url}>
      <Suspense fallback={<LoadingRing />}>
        <PickHelper>
          <FittedGlb key={model.url} url={model.url} scale={scale}>
            {pins}
          </FittedGlb>
        </PickHelper>
      </Suspense>
    </ModelBoundary>
  )
}

function LoadingRing() {
  const t = useT()
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position-y={0.05}>
        <ringGeometry args={[1.2, 1.25, 64]} />
        <meshBasicMaterial color="#d4a64a" transparent opacity={0.6} />
      </mesh>
      <Html center position={[0, 0.6, 0]}>
        <span className="kicker whitespace-nowrap">{t('loadingModel')}…</span>
      </Html>
    </group>
  )
}

function Stage({ landmark, quality }: { landmark: LandmarkDetail; quality: Quality }) {
  const t = useT()
  const eraIndex = useAppStore((s) => s.eraIndex)
  const compare = useAppStore((s) => s.compareEras)
  const eras = landmark.eras
  const era = eras[eraIndex]
  const scale = landmark.model_scale || 1
  const modelsFor = (e?: Era) => (e?.models.length ? e.models : landmark.models)

  if (compare && eras.length > 1) {
    // Before / after: the selected era next to the latest one.
    const other = eraIndex === eras.length - 1 ? eras[0] : eras[eras.length - 1]
    const pair = [era, other].sort((a, b) => a.year - b.year)
    return (
      <Plinth>
        {pair.map((e, i) => (
          <group key={e.id} position={[i === 0 ? -2.3 : 2.3, 0, 0]} scale={0.55}>
            <ModelSlot models={modelsFor(e)} kind={landmark.placeholder} variant={e.placeholder_variant} scale={scale} quality={quality} hotspots={[]} />
            <Html center position={[0, 6.2, 0]}>
              <div className="compare-label">
                <span>{e.label}</span>
                <small>{formatYear(e.year, t, e.year_is_approximate)}</small>
              </div>
            </Html>
          </group>
        ))}
      </Plinth>
    )
  }

  return (
    <Plinth>
      <ModelSlot
        models={modelsFor(era)}
        kind={landmark.placeholder}
        variant={era?.placeholder_variant}
        scale={scale}
        quality={quality}
        hotspots={landmark.hotspots}
      />
    </Plinth>
  )
}

/** Prefetches the next landmark's data and model so "next" opens instantly. */
function PrefetchNext({ slug, quality }: { slug: string; quality: Quality }) {
  const queryClient = useQueryClient()
  const lang = useAppStore((s) => s.lang)
  const { data: all } = useLandmarks()
  useEffect(() => {
    if (!all) return
    const i = all.findIndex((l) => l.slug === slug)
    const next = all[(i + 1) % all.length]
    if (!next || next.slug === slug) return
    queryClient
      .fetchQuery({ queryKey: ['landmark', next.slug, lang], queryFn: ({ signal }) => api.landmark(next.slug, lang, signal), staleTime: 5 * 60_000 })
      .then((detail) => {
        const model = pickModel(detail.models, quality)
        if (model) useGLTF.preload(model.url, DRACO_PATH, true)
      })
      .catch(() => undefined)
  }, [all, slug, lang, quality, queryClient])
  return null
}

/** The landmark's own scene: studio lighting, plinth, model(s) and hotspots. */
export function DetailStage({ quality }: { quality: Quality }) {
  const slug = useAppStore((s) => s.selectedSlug)
  const { data: landmark } = useLandmark(slug)
  if (!landmark || landmark.slug !== slug) return null
  return (
    <group>
      {/* Procedural studio HDRI: nothing to download, a consistent golden rim light. */}
      <Environment resolution={quality === 'low' ? 64 : 256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffe2b8" position={[-5, 5, -5]} scale={[10, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#9fb4ff" position={[6, 3, 4]} scale={[8, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={3} color="#d4a64a" position={[0, 8, 0]} scale={4} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[0, 1, 9]} scale={[12, 1, 1]} target={[0, 0, 0]} />
      </Environment>
      <Stage landmark={landmark} quality={quality} />
      {quality !== 'low' && <ContactShadows position={[0, 0.01, 0]} scale={9} blur={2.4} far={4} opacity={0.65} resolution={512} color="#000814" />}
      <PrefetchNext slug={landmark.slug} quality={quality} />
    </group>
  )
}
