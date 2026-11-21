import { AdaptiveDpr, PerformanceMonitor, useProgress } from '@react-three/drei'
import { Canvas, useThree } from '@react-three/fiber'
import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { Suspense, use, useEffect } from 'react'
import { ACESFilmicToneMapping, SRGBColorSpace, type PerspectiveCamera } from 'three'
import { useLandmarks } from '../api/hooks'
import { QUALITY } from '../lib/device'
import { loadTerrain, type TerrainData } from '../lib/geo'
import { useAppStore } from '../store/useAppStore'
import { buildStoryPath } from './camera/director'
import { CameraRig } from './camera/CameraRig'
import { DetailStage } from './detail/DetailStage'
import { Atmosphere } from './map/Atmosphere'
import { Markers } from './map/Markers'
import { Border, Terrain } from './map/Terrain'

/** Map scene: relief, border and markers. Hidden (not unmounted) during the detail view. */
function MapScene({ terrainUrl, detail }: { terrainUrl: string; detail: number }) {
  const terrain = use(loadTerrain(terrainUrl))
  const { data: landmarks } = useLandmarks()
  const visible = useAppStore((s) => s.mode !== 'detail')
  const setTerrainReady = useAppStore((s) => s.setTerrainReady)

  useEffect(() => setTerrainReady(), [setTerrainReady])
  useEffect(() => {
    if (landmarks) buildStoryPath(landmarks)
  }, [landmarks, terrain])

  return (
    <group visible={visible}>
      <Terrain data={terrain} detail={detail} />
      <Border data={terrain} />
      {landmarks && <Markers landmarks={landmarks} terrain={terrain as TerrainData} />}
    </group>
  )
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
 * Shifts the projection so the subject is centred in the space the UI leaves free:
 * left of the side panel on desktop, above the bottom sheet on phones.
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

/** Reports three.js loader progress (GLBs, textures) to the store-driven loader UI. */
function ProgressBridge({ onProgress }: { onProgress: (p: number) => void }) {
  const { progress } = useProgress()
  useEffect(() => onProgress(progress), [progress, onProgress])
  return null
}

export default function Experience({ onProgress }: { onProgress: (p: number) => void }) {
  const quality = useAppStore((s) => s.quality)
  const setQuality = useAppStore((s) => s.setQuality)
  const night = useAppStore((s) => s.timeOfDay === 'night')
  const detail = useAppStore((s) => s.mode === 'detail')
  const preset = QUALITY[quality]

  return (
    <Canvas
      className="experience"
      dpr={preset.dpr}
      gl={{ antialias: quality !== 'low', powerPreference: 'high-performance', outputColorSpace: SRGBColorSpace, toneMapping: ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      camera={{ fov: 40, near: 0.1, far: 1500, position: [-20, 150, 150] }}
      shadows={preset.shadows && detail}
    >
      {/* Drop a quality tier automatically if the frame rate stays low. */}
      <PerformanceMonitor
        onDecline={() => setQuality(quality === 'high' ? 'medium' : 'low')}
        flipflops={2}
      />
      <AdaptiveDpr pixelated={false} />
      <ProgressBridge onProgress={onProgress} />
      <Atmosphere />
      <CameraRig />
      <ViewOffset active={detail} />
      <Suspense fallback={null}>
        <MapScene terrainUrl={preset.terrain} detail={preset.segments} />
      </Suspense>
      {detail && (
        <Suspense fallback={null}>
          <DetailStage quality={quality} />
        </Suspense>
      )}
      {preset.postfx && <PostFX night={night} />}
    </Canvas>
  )
}
