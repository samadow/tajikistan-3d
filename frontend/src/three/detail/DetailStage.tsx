import { ContactShadows, Environment, Html, Lightformer, useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react'
import { Box3, Vector3, type Object3D } from 'three'
import { KTX2Loader } from 'three-stdlib'
import { useLandmark } from '../../api/hooks'
import type { Hotspot, LandmarkDetail } from '../../api/types'
import { disposeObject } from '../../lib/dispose'
import { pickModel } from '../../lib/models'
import { useAppStore } from '../../store/useAppStore'
import { PlaceholderModel, Plinth } from './Placeholders'

const DRACO_PATH = '/decoders/draco/'
const FIT_SIZE = 5 // GLBs are scaled to fit this footprint on the plinth

let ktx2: KTX2Loader | null = null

/** useGLTF with local Draco, meshopt and KTX2 decoders. */
function useModel(url: string) {
  const gl = useThree((s) => s.gl)
  return useGLTF(url, DRACO_PATH, true, (loader) => {
    if (!ktx2) ktx2 = new KTX2Loader().setTranscoderPath('/decoders/basis/').detectSupport(gl)
    loader.setKTX2Loader(ktx2)
  })
}

function GlbModel({ url, scale }: { url: string; scale: number }) {
  const { scene } = useModel(url)
  // Normalise any uploaded model: centre it on the plinth and fit it to FIT_SIZE.
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
    // Free GPU memory when leaving this model.
    return () => {
      disposeObject(scene)
      useGLTF.clear(url)
    }
  }, [scene, url])

  return (
    <group scale={fit.s}>
      <primitive object={scene} position={fit.offset} />
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
    console.warn('Model failed to load, showing placeholder.', error)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

function Hotspots({ hotspots }: { hotspots: Hotspot[] }) {
  const active = useAppStore((s) => s.activeHotspot)
  const setActive = useAppStore((s) => s.setActiveHotspot)
  return (
    <>
      {hotspots.map((h, i) => (
        <Html key={h.id} position={[h.position.x, h.position.y, h.position.z]} center zIndexRange={[30, 0]}>
          <div className={`hotspot ${active === h.id ? 'is-active' : ''}`}>
            <button
              type="button"
              className="hotspot__dot"
              aria-label={h.title}
              aria-expanded={active === h.id}
              onClick={() => setActive(active === h.id ? null : h.id)}
            >
              {i + 1}
            </button>
            {active === h.id && (
              <div className="hotspot__card" role="dialog">
                <strong>{h.title}</strong>
                {h.text && <p>{h.text}</p>}
              </div>
            )}
          </div>
        </Html>
      ))}
    </>
  )
}

function Stage({ landmark }: { landmark: LandmarkDetail }) {
  const eraIndex = useAppStore((s) => s.eraIndex)
  const era = landmark.eras[eraIndex]
  const quality = useAppStore((s) => s.quality)
  const url = pickModel(era?.models.length ? era.models : landmark.models, quality)?.url ?? null
  const variant = era?.placeholder_variant
  const placeholder = <PlaceholderModel key={`${landmark.slug}-${variant}`} kind={landmark.placeholder} variant={variant} />

  return (
    <group>
      <Plinth>
        {url ? (
          <ModelBoundary fallback={placeholder} resetKey={url}>
            <Suspense fallback={<LoadingRing />}>
              <GlbModel key={url} url={url} scale={landmark.model_scale || 1} />
            </Suspense>
          </ModelBoundary>
        ) : (
          placeholder
        )}
      </Plinth>
      <Hotspots hotspots={landmark.hotspots} />
    </group>
  )
}

function LoadingRing() {
  return (
    <mesh rotation-x={-Math.PI / 2} position-y={0.05}>
      <ringGeometry args={[1.2, 1.25, 64]} />
      <meshBasicMaterial color="#d4a64a" transparent opacity={0.6} />
    </mesh>
  )
}

/** The landmark's own scene: studio lighting, plinth, model and hotspots. */
export function DetailStage({ quality }: { quality: 'high' | 'medium' | 'low' }) {
  const slug = useAppStore((s) => s.selectedSlug)
  const { data: landmark } = useLandmark(slug)
  if (!landmark || landmark.slug !== slug) return null
  return (
    <group>
      {/* Procedural studio HDRI: no download, consistent golden rim light. */}
      <Environment resolution={quality === 'low' ? 64 : 256} frames={1}>
        <Lightformer form="rect" intensity={2.2} color="#ffe2b8" position={[-5, 5, -5]} scale={[10, 5, 1]} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={1.2} color="#9fb4ff" position={[6, 3, 4]} scale={[8, 3, 1]} target={[0, 0, 0]} />
        <Lightformer form="ring" intensity={3} color="#d4a64a" position={[0, 8, 0]} scale={4} target={[0, 0, 0]} />
        <Lightformer form="rect" intensity={0.6} color="#ffffff" position={[0, 1, 9]} scale={[12, 1, 1]} target={[0, 0, 0]} />
      </Environment>
      <Stage landmark={landmark} />
      {quality !== 'low' && <ContactShadows position={[0, 0.01, 0]} scale={9} blur={2.4} far={4} opacity={0.65} resolution={512} color="#000814" />}
    </group>
  )
}
