import { useThree } from '@react-three/fiber'
import { useEffect, useMemo, useState } from 'react'
import { MeshStandardMaterial, TextureLoader, type Texture } from 'three'
import { decodeHeightmap, loadJSON, projectXZ, type HeightGrid, type PatchInfo, type TerrainData } from '../../lib/geo'
import { EDGE_FADE } from '../terrain/mesh'
import { useTerrainGeometry } from '../terrain/useTerrainGeometry'
import { prepareColorTexture, type PatchRect } from './Terrain'

interface LoadedPatch {
  slug: string
  info: PatchInfo
  grid: HeightGrid
  texture: Texture
}

/**
 * High-resolution relief (~90 m/px) around one landmark, loaded on demand when
 * the camera flies there (ADR-6). Its edges blend into the country mesh, which
 * cuts a hole underneath via `onRect`.
 */
export function DetailPatch({
  slug,
  data,
  segments,
  onRect,
}: {
  slug: string | null
  data: TerrainData
  segments: number
  onRect: (rect: PatchRect) => void
}) {
  const gl = useThree((s) => s.gl)
  const [patch, setPatch] = useState<LoadedPatch | null>(null)

  useEffect(() => {
    if (!slug) return
    let cancelled = false
    ;(async () => {
      const index = await loadJSON<Record<string, PatchInfo>>('/terrain/patches.json')
      const info = index[slug]
      if (!info) return // landmark added after the last terrain build — base terrain is used
      const [grid, texture] = await Promise.all([
        decodeHeightmap(`/terrain/patches/${slug}.png`, info, info.elevationMin, info.elevationMax),
        new TextureLoader().loadAsync(`/terrain/patches/${slug}.webp`),
      ])
      prepareColorTexture(texture, Math.min(8, gl.capabilities.getMaxAnisotropy()))
      if (cancelled) {
        texture.dispose()
        return
      }
      setPatch({ slug, info, grid, texture })
    })().catch((error) => console.warn('Detail patch unavailable', error))
    return () => {
      cancelled = true
    }
  }, [slug, gl])

  const request = useMemo(
    () => (patch ? { bounds: data.bounds, base: data.grid, detail: patch.grid, rect: patch.info, segments, edgeFade: EDGE_FADE } : null),
    [patch, data, segments],
  )
  const geometry = useTerrainGeometry(request, `${patch?.slug ?? 'none'}|${segments}`)
  const material = useMemo(
    () => (patch ? new MeshStandardMaterial({ map: patch.texture, roughness: 0.93, polygonOffset: true, polygonOffsetFactor: -1 }) : null),
    [patch],
  )
  useEffect(() => () => material?.dispose(), [material])

  // Tell the base terrain where to cut its hole once the patch mesh exists.
  const visible = !!geometry && !!patch && patch.slug === slug
  useEffect(() => {
    if (!visible || !patch) {
      onRect(null)
      return
    }
    const [x0, z0] = projectXZ(data.bounds, patch.info.lonMin, patch.info.latMax)
    const [x1, z1] = projectXZ(data.bounds, patch.info.lonMax, patch.info.latMin)
    onRect([x0, z0, x1, z1])
  }, [visible, patch, data, onRect])

  // Free each patch texture once it is replaced or on unmount.
  useEffect(() => () => patch?.texture.dispose(), [patch])

  if (!visible || !geometry || !material) return null
  return <mesh geometry={geometry} material={material} receiveShadow />
}
