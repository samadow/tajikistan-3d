import { AdaptiveDpr, PerformanceMonitor } from '@react-three/drei'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Component, Suspense, use, useCallback, useEffect, useState, type ReactNode } from 'react'
import { ACESFilmicToneMapping, DefaultLoadingManager, SRGBColorSpace, type PerspectiveCamera } from 'three'
import { useLandmarks } from '../api/hooks'
import { useT } from '../i18n/strings'
import { isDebug, QUALITY } from '../lib/device'
import { loadTerrain } from '../lib/geo'
import { useAppStore } from '../store/useAppStore'
import { CameraRig } from './camera/CameraRig'
import { registerTerrain } from './camera/director'
import { DetailStage } from './detail/DetailStage'
import { Globe } from './intro/Globe'
import { Atmosphere } from './map/Atmosphere'
import { DetailPatch } from './map/DetailPatch'
import { Markers } from './map/Markers'
import { AreaOutlines, Border, Lakes } from './map/Overlays'
import { Terrain, type PatchRect } from './map/Terrain'

/** Relief, water, border and markers. Hidden — not unmounted — during the detail view and the globe intro. */
function MapScene({ heightmap, colorMap, segments, patchSegments }: { heightmap: string; colorMap: string; segments: number; patchSegments: number }) {
  const terrain = use(loadTerrain(heightmap))
  const { data: landmarks } = useLandmarks()
  const mode = useAppStore((s) => s.mode)
  const selected = useAppStore((s) => s.selectedSlug)
  const setTerrainReady = useAppStore((s) => s.setTerrainReady)
  const [patchRect, setPatchRect] = useState<PatchRect>(null)
  const onRect = useCallback((r: PatchRect) => setPatchRect(r), [])
  const visible = mode === 'map' || mode === 'flying' || mode === 'intro' || mode === 'story'
  // Load the high-resolution relief where the camera is heading or lingering.
  const patchSlug = mode === 'flying' || mode === 'detail' || mode === 'story' ? selected : null

  useEffect(() => {
    registerTerrain(terrain)
    setTerrainReady()
  }, [terrain, setTerrainReady])

  return (
    <group visible={visible}>
      <Terrain data={terrain} segments={segments} colorMap={colorMap} patch={patchRect} />
      <DetailPatch slug={patchSlug} data={terrain} segments={patchSegments} onRect={onRect} />
      <Lakes data={terrain} />
      <Border data={terrain} />
      {landmarks && <AreaOutlines data={terrain} landmarks={landmarks} />}
      {landmarks && <Markers landmarks={landmarks} terrain={terrain} />}
    </group>
  )
}

/** Shows the 2D interface instead of a blank screen if the 3D scene crashes. */
class SceneBoundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(error: unknown) {
    console.error('3D scene failed; switching to the 2D interface.', error)
    this.props.onError()
  }
  render() {
    return this.state.failed ? null : this.props.children
  }
}

function PostFX({ night }: { night: boolean }) {
  return (
    <EffectComposer multisampling={0} enableNormalPass={false}>
      <Bloom mipmapBlur luminanceThreshold={0.85} luminanceSmoothing={0.2} intensity={night ? 1.4 : 0.8} radius={0.75} />
      <Vignette offset={0.28} darkness={0.75} />
    </EffectComposer>
  )
}

/**
 * Shifts the projection so the subject is centred in the space the UI leaves
 * free: left of the side panel on desktop, above the bottom sheet on phones.
 */
function ViewOffset({ active }: { active: boolean }) {
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const { width, height } = useThree((s) => s.size)
  useEffect(() => {
    if (!active) {
      camera.clearViewOffset()
      return
    }
    if (width >= 1024) {
      const panel = Math.min(544, width * 0.4) + 16
      camera.setViewOffset(width, height, panel / 2, 0, width, height)
    } else {
      camera.setViewOffset(width, height, 0, height * 0.24, width, height)
    }
    return () => camera.clearViewOffset()
  }, [active, camera, width, height])
  return null
}

/**
 * Reports loader progress (textures, GLBs) to the DOM loader. Subscribes to the
 * loading manager directly and defers the store update, because loaders can
 * report synchronously while React is rendering (drei's useProgress warns then).
 */
function ProgressBridge() {
  const setLoadProgress = useAppStore((s) => s.setLoadProgress)
  useEffect(() => {
    const previous = DefaultLoadingManager.onProgress
    DefaultLoadingManager.onProgress = (url, loaded, total) => {
      previous?.(url, loaded, total)
      queueMicrotask(() => setLoadProgress(total ? (loaded / total) * 100 : 100))
    }
    return () => {
      DefaultLoadingManager.onProgress = previous
    }
  }, [setLoadProgress])
  return null
}

/**
 * `?debug` exposes per-frame renderer statistics (window.__TJ3D__) for
 * performance tests. Counters accumulate over every pass of a frame
 * (scene + post-processing) and are read and reset at the start of the next.
 */
function DebugStats() {
  const gl = useThree((s) => s.gl)
  useEffect(() => {
    gl.info.autoReset = false
    return () => {
      gl.info.autoReset = true
    }
  }, [gl])
  useFrame((_, delta) => {
    const w = window as Window & { __TJ3D__?: Record<string, number> }
    const r = gl.info.render
    w.__TJ3D__ = {
      calls: r.calls,
      triangles: r.triangles,
      geometries: gl.info.memory.geometries,
      textures: gl.info.memory.textures,
      pixelRatio: gl.getPixelRatio(),
      fps: Math.round(1 / Math.max(delta, 1e-3)),
    }
    gl.info.reset()
  })
  return null
}

export default function Experience() {
  const t = useT()
  const quality = useAppStore((s) => s.quality)
  const degrade = useAppStore((s) => s.degradeQuality)
  const failWebgl = useAppStore((s) => s.failWebgl)
  const night = useAppStore((s) => s.timeOfDay === 'night')
  const detail = useAppStore((s) => s.mode === 'detail')
  const preset = QUALITY[quality]
  // Data resolution is chosen once: dropping a tier later only lowers the mesh density,
  // so the already-downloaded heightmap is reused instead of reloading the scene.
  const [data] = useState(() => ({ heightmap: preset.heightmap, colorMap: preset.colorMap }))

  return (
    <Canvas
      className="experience"
      dpr={preset.dpr}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', outputColorSpace: SRGBColorSpace, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ fov: 40, near: 0.1, far: 1500, position: [0, 60, 200] }}
      shadows={preset.shadows && detail}
      aria-label={t('canvasLabel')}
      role="img"
      onCreated={({ gl }) => {
        gl.domElement.addEventListener('webglcontextlost', (e) => {
          e.preventDefault()
          failWebgl()
        })
      }}
    >
      <PerformanceMonitor onDecline={degrade} flipflops={2} />
      <AdaptiveDpr pixelated={false} />
      <ProgressBridge />
      <Atmosphere stars={preset.stars} />
      <CameraRig />
      <ViewOffset active={detail} />
      <SceneBoundary onError={failWebgl}>
        <Suspense fallback={null}>
          <Globe />
        </Suspense>
        <Suspense fallback={null}>
          <MapScene heightmap={data.heightmap} colorMap={data.colorMap} segments={preset.segments} patchSegments={preset.patchSegments} />
        </Suspense>
        {detail && (
          <Suspense fallback={null}>
            <DetailStage quality={quality} />
          </Suspense>
        )}
      </SceneBoundary>
      {preset.postfx && <PostFX night={night} />}
      {isDebug() && <DebugStats />}
    </Canvas>
  )
}
