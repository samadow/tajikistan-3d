import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import { AdditiveBlending, BackSide, Color, MathUtils, ShaderMaterial, SRGBColorSpace, Vector3, type Group } from 'three'
import { useAppStore } from '../../store/useAppStore'

export const GLOBE_RADIUS = 40
/** Tajikistan's centre on the globe (lat 38.85°, lon 71.25°). */
export const TAJIKISTAN_DIR = latLonToDirection(38.85, 71.25)

/** Direction on a three.js SphereGeometry for a lat/lon (matches its UV mapping). */
export function latLonToDirection(lat: number, lon: number): Vector3 {
  const phi = ((lon + 180) / 360) * Math.PI * 2
  const theta = ((90 - lat) / 180) * Math.PI
  return new Vector3(-Math.cos(phi) * Math.sin(theta), Math.cos(theta), Math.sin(phi) * Math.sin(theta)).normalize()
}

const glowMaterial = () =>
  new ShaderMaterial({
    side: BackSide,
    transparent: true,
    depthWrite: false,
    blending: AdditiveBlending,
    uniforms: { uColor: { value: new Color('#5d86ff') }, uOpacity: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec3 vNormal;
      varying vec3 vView;
      void main() {
        float rim = pow(1.0 - abs(dot(vNormal, vView)), 2.2);
        gl_FragColor = vec4(uColor * rim * 1.6, rim * uOpacity);
      }`,
  })

/** Stylised Earth used by the opening shot (texture built by the terrain tool from Natural Earth). */
export function Globe() {
  const group = useRef<Group>(null)
  const visible = useAppStore((s) => s.mode === 'globe' || s.mode === 'loading')
  const map = useTexture('/terrain/globe.webp', (t) => {
    const texture = Array.isArray(t) ? t[0] : t
    texture.colorSpace = SRGBColorSpace
    texture.anisotropy = 4
  })
  const glow = useMemo(glowMaterial, [])
  const fade = useRef(1)

  useFrame((_, delta) => {
    if (!group.current) return
    fade.current = MathUtils.damp(fade.current, visible ? 1 : 0, 4, delta)
    group.current.visible = fade.current > 0.01
    glow.uniforms.uOpacity.value = fade.current
  })

  return (
    <group ref={group}>
      <mesh>
        <sphereGeometry args={[GLOBE_RADIUS, 96, 64]} />
        <meshStandardMaterial map={map} emissiveMap={map} emissive="#ffffff" emissiveIntensity={0.35} roughness={0.9} />
      </mesh>
      <mesh material={glow} scale={1.12}>
        <sphereGeometry args={[GLOBE_RADIUS, 64, 48]} />
      </mesh>
    </group>
  )
}
