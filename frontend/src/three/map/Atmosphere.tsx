import { Stars } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, Color, Fog, MathUtils, ShaderMaterial, type DirectionalLight, type HemisphereLight } from 'three'
import { useAppStore } from '../../store/useAppStore'

interface Mood {
  skyTop: string
  skyHorizon: string
  fog: string
  sun: string
  sunIntensity: number
  sunPos: [number, number, number]
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
}

// "day" is a golden-hour look, "night" is moonlit, "space" frames the globe.
const MOODS: Record<'day' | 'night' | 'detail' | 'space', Mood> = {
  day: {
    skyTop: '#0b1638', skyHorizon: '#b97f52', fog: '#141c3d',
    sun: '#ffd6a0', sunIntensity: 2.6, sunPos: [-55, 32, 25],
    hemiSky: '#a9bcff', hemiGround: '#3a2716', hemiIntensity: 0.7,
  },
  night: {
    skyTop: '#02040c', skyHorizon: '#1d2b5e', fog: '#070c20',
    sun: '#93a9ff', sunIntensity: 0.8, sunPos: [40, 60, -30],
    hemiSky: '#3c4c8a', hemiGround: '#05070f', hemiIntensity: 0.35,
  },
  detail: {
    skyTop: '#060b1f', skyHorizon: '#1c2550', fog: '#0a1129',
    sun: '#ffe2b8', sunIntensity: 2.4, sunPos: [-55, 32, 25],
    hemiSky: '#b7c5ff', hemiGround: '#1b140c', hemiIntensity: 0.5,
  },
  space: {
    skyTop: '#01030a', skyHorizon: '#030817', fog: '#01030a',
    sun: '#fff1dc', sunIntensity: 2.2, sunPos: [-120, 60, 140],
    hemiSky: '#7f9cff', hemiGround: '#000000', hemiIntensity: 0.25,
  },
}

const skyMaterial = () =>
  new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { top: { value: new Color() }, horizon: { value: new Color() }, ground: { value: new Color() } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 ground;
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        // A narrow warm band at the horizon, deep blue above, fog colour below.
        vec3 col = h < 0.0
          ? mix(horizon, ground, smoothstep(0.0, -0.12, h))
          : mix(horizon, top, pow(smoothstep(0.0, 0.45, h), 0.5));
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  })

/** Sky dome, fog and lights; eases between moods when time of day or the scene phase changes. */
export function Atmosphere({ stars }: { stars: number }) {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const sky = useMemo(skyMaterial, [])
  const fog = useMemo(() => new Fog('#141c3d', 70, 190), [])
  const night = useAppStore((s) => s.timeOfDay === 'night')
  const mode = useAppStore((s) => s.mode)
  const space = mode === 'globe' || mode === 'loading'
  const detail = mode === 'detail'

  const target = useMemo(() => {
    const mood = space ? MOODS.space : detail ? MOODS.detail : night ? MOODS.night : MOODS.day
    return {
      ...mood,
      skyTopC: new Color(mood.skyTop),
      skyHorizonC: new Color(mood.skyHorizon),
      fogC: new Color(mood.fog),
      sunC: new Color(mood.sun),
      hemiSkyC: new Color(mood.hemiSky),
      hemiGroundC: new Color(mood.hemiGround),
    }
  }, [night, detail, space])

  if (scene.fog !== fog) scene.fog = fog

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-delta * 2.5)
    sky.uniforms.top.value.lerp(target.skyTopC, k)
    sky.uniforms.horizon.value.lerp(target.skyHorizonC, k)
    fog.color.lerp(target.fogC, k)
    sky.uniforms.ground.value.copy(fog.color)
    // Fog follows the camera distance so the far edge of the map always melts away.
    const far = space ? 5000 : detail ? 400 : MathUtils.clamp(camera.position.length() * 1.9, 80, 480)
    fog.far = space ? far : MathUtils.lerp(fog.far, far, k)
    fog.near = fog.far * 0.42
    if (sun.current) {
      sun.current.color.lerp(target.sunC, k)
      sun.current.intensity = MathUtils.lerp(sun.current.intensity, target.sunIntensity, k)
      sun.current.position.x = MathUtils.lerp(sun.current.position.x, target.sunPos[0], k)
      sun.current.position.y = MathUtils.lerp(sun.current.position.y, target.sunPos[1], k)
      sun.current.position.z = MathUtils.lerp(sun.current.position.z, target.sunPos[2], k)
    }
    if (hemi.current) {
      hemi.current.color.lerp(target.hemiSkyC, k)
      hemi.current.groundColor.lerp(target.hemiGroundC, k)
      hemi.current.intensity = MathUtils.lerp(hemi.current.intensity, target.hemiIntensity, k)
    }
  })

  return (
    <>
      <mesh material={sky} scale={600} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <directionalLight ref={sun} position={MOODS.space.sunPos} intensity={2.2} />
      <hemisphereLight ref={hemi} intensity={0.3} />
      {(night || detail || space) && <Stars radius={320} depth={80} count={stars} factor={6} fade speed={0.4} />}
    </>
  )
}
