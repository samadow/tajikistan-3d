import { Stars } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { BackSide, Color, Fog, MathUtils, ShaderMaterial, type DirectionalLight, type HemisphereLight } from 'three'
import { useAppStore } from '../../store/useAppStore'

// Palette per mood. "day" is a golden-hour look, "night" is moonlit.
const MOODS = {
  day: {
    skyTop: '#0b1638',
    skyHorizon: '#b97f52',
    fog: '#141c3d',
    sun: '#ffd6a0',
    sunIntensity: 3.2,
    hemiSky: '#a9bcff',
    hemiGround: '#3a2716',
    hemiIntensity: 0.75,
  },
  night: {
    skyTop: '#02040c',
    skyHorizon: '#1d2b5e',
    fog: '#070c20',
    sun: '#93a9ff',
    sunIntensity: 0.9,
    hemiSky: '#3c4c8a',
    hemiGround: '#05070f',
    hemiIntensity: 0.35,
  },
  detail: {
    skyTop: '#060b1f',
    skyHorizon: '#1c2550',
    fog: '#0a1129',
    sun: '#ffe2b8',
    sunIntensity: 2.4,
    hemiSky: '#b7c5ff',
    hemiGround: '#1b140c',
    hemiIntensity: 0.5,
  },
}

const SUN_DAY: [number, number, number] = [-55, 32, 25]
const SUN_NIGHT: [number, number, number] = [40, 60, -30]

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

/** Sky dome, fog and lights; eases between moods when day/night or the scene phase changes. */
export function Atmosphere() {
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera)
  const sun = useRef<DirectionalLight>(null)
  const hemi = useRef<HemisphereLight>(null)
  const sky = useMemo(skyMaterial, [])
  const fog = useMemo(() => new Fog('#141c3d', 70, 190), [])
  const night = useAppStore((s) => s.timeOfDay === 'night')
  const detail = useAppStore((s) => s.mode === 'detail')
  const targets = useMemo(() => {
    const mood = detail ? MOODS.detail : night ? MOODS.night : MOODS.day
    return {
      skyTop: new Color(mood.skyTop),
      skyHorizon: new Color(mood.skyHorizon),
      fog: new Color(mood.fog),
      sun: new Color(mood.sun),
      sunIntensity: mood.sunIntensity,
      hemiSky: new Color(mood.hemiSky),
      hemiGround: new Color(mood.hemiGround),
      hemiIntensity: mood.hemiIntensity,
      sunPos: night && !detail ? SUN_NIGHT : SUN_DAY,
    }
  }, [night, detail])

  // Attach fog once.
  if (scene.fog !== fog) scene.fog = fog

  useFrame((_, delta) => {
    const k = 1 - Math.exp(-delta * 2.5)
    sky.uniforms.top.value.lerp(targets.skyTop, k)
    sky.uniforms.horizon.value.lerp(targets.skyHorizon, k)
    fog.color.lerp(targets.fog, k)
    sky.uniforms.ground.value.copy(fog.color)
    // Fog distance follows the camera height so the far edge of the map always melts away.
    const far = detail ? 400 : MathUtils.clamp(camera.position.length() * 1.9, 80, 480)
    fog.far = MathUtils.lerp(fog.far, far, k)
    fog.near = fog.far * 0.42
    if (sun.current) {
      sun.current.color.lerp(targets.sun, k)
      sun.current.intensity = MathUtils.lerp(sun.current.intensity, targets.sunIntensity, k)
      sun.current.position.x = MathUtils.lerp(sun.current.position.x, targets.sunPos[0], k)
      sun.current.position.y = MathUtils.lerp(sun.current.position.y, targets.sunPos[1], k)
      sun.current.position.z = MathUtils.lerp(sun.current.position.z, targets.sunPos[2], k)
    }
    if (hemi.current) {
      hemi.current.color.lerp(targets.hemiSky, k)
      hemi.current.groundColor.lerp(targets.hemiGround, k)
      hemi.current.intensity = MathUtils.lerp(hemi.current.intensity, targets.hemiIntensity, k)
    }
  })

  return (
    <>
      <mesh material={sky} scale={600} renderOrder={-1} frustumCulled={false}>
        <sphereGeometry args={[1, 32, 16]} />
      </mesh>
      <directionalLight ref={sun} position={SUN_DAY} intensity={3} />
      <hemisphereLight ref={hemi} intensity={0.7} />
      {(night || detail) && <Stars radius={300} depth={60} count={detail ? 1500 : 3000} factor={6} fade speed={0.4} />}
    </>
  )
}
