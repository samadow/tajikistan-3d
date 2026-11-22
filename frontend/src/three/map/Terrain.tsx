import { useTexture } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { MeshStandardMaterial, SRGBColorSpace, Vector4, type Texture } from 'three'
import type { TerrainData } from '../../lib/geo'
import { EDGE_FADE } from '../terrain/mesh'
import { useTerrainGeometry } from '../terrain/useTerrainGeometry'

/** World-space rectangle (xMin, zMin, xMax, zMax) where a detail patch replaces the base terrain. */
export type PatchRect = [number, number, number, number] | null

export function prepareColorTexture(texture: Texture, anisotropy: number) {
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = anisotropy
  texture.needsUpdate = true
}

/**
 * Terrain material: the baked colour texture plus a cut-out where a detail
 * patch is shown (so the coarse and fine meshes never z-fight).
 */
function useTerrainMaterial(map: Texture, patch: PatchRect) {
  const material = useMemo(() => {
    const m = new MeshStandardMaterial({ map, roughness: 0.93, metalness: 0.0 })
    const uniforms = { uPatch: { value: new Vector4(0, 0, 0, 0) }, uPatchOn: { value: 0 } }
    m.userData.uniforms = uniforms
    m.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms)
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTjWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvTjWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;')
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vTjWorld;\nuniform vec4 uPatch;\nuniform float uPatchOn;')
        .replace(
          'void main() {',
          `void main() {
  if (uPatchOn > 0.5 && vTjWorld.x > uPatch.x && vTjWorld.x < uPatch.z && vTjWorld.z > uPatch.y && vTjWorld.z < uPatch.w) discard;`,
        )
    }
    return m
  }, [map])

  useEffect(() => {
    const u = material.userData.uniforms as { uPatch: { value: Vector4 }; uPatchOn: { value: number } }
    if (patch) {
      // Inset slightly: the patch overlaps the cut by a hair, so no cracks show.
      const ix = (patch[2] - patch[0]) * 0.01
      const iz = (patch[3] - patch[1]) * 0.01
      u.uPatch.value.set(patch[0] + ix, patch[1] + iz, patch[2] - ix, patch[3] - iz)
      u.uPatchOn.value = 1
    } else {
      u.uPatchOn.value = 0
    }
  }, [material, patch])

  useEffect(() => () => material.dispose(), [material])
  return material
}

export function Terrain({ data, segments, colorMap, patch }: { data: TerrainData; segments: number; colorMap: string; patch: PatchRect }) {
  const gl = useThree((s) => s.gl)
  const map = useTexture(colorMap, (t) => prepareColorTexture(Array.isArray(t) ? t[0] : t, Math.min(8, gl.capabilities.getMaxAnisotropy())))
  const material = useTerrainMaterial(map, patch)
  const request = useMemo(() => ({ bounds: data.bounds, base: data.grid, segments, edgeFade: EDGE_FADE }), [data, segments])
  const geometry = useTerrainGeometry(request, `${colorMap}|${segments}|${data.grid.width}`)

  return (
    <group>
      {geometry && <mesh geometry={geometry} material={material} receiveShadow />}
      {/* Endless ground so the map never shows an edge; fog fades it out. */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.03}>
        <circleGeometry args={[900, 64]} />
        <meshStandardMaterial color="#0d1733" roughness={1} />
      </mesh>
    </group>
  )
}
