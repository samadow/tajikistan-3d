import { OrbitControls } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import { useAppStore } from '../../store/useAppStore'
import { registerCamera } from './director'

/** Orbit controls whose limits change with the scene phase. Scripted moves live in director.ts. */
export function CameraRig() {
  const controlsRef = useRef<OrbitControlsImpl>(null)
  const camera = useThree((s) => s.camera) as PerspectiveCamera
  const mode = useAppStore((s) => s.mode)

  useEffect(() => {
    if (controlsRef.current) registerCamera(camera, controlsRef.current)
  }, [camera])

  const interactive = mode === 'map' || mode === 'detail'
  const detail = mode === 'detail'

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enabled={interactive}
      enableDamping
      dampingFactor={0.08}
      rotateSpeed={0.6}
      zoomSpeed={0.8}
      enablePan={!detail}
      screenSpacePanning={false}
      minDistance={detail ? 3.5 : 6}
      maxDistance={detail ? 26 : 250}
      minPolarAngle={detail ? 0.2 : 0.15}
      maxPolarAngle={detail ? 1.45 : 1.3}
      autoRotate={detail}
      autoRotateSpeed={0.6}
      onChange={() => {
        // Keep the map target over the country so users cannot pan into the void.
        const ctl = controlsRef.current
        if (!ctl || detail) return
        ctl.target.x = Math.max(-48, Math.min(48, ctl.target.x))
        ctl.target.z = Math.max(-36, Math.min(36, ctl.target.z))
      }}
    />
  )
}
