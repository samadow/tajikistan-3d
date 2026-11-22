import { useEffect, useState } from 'react'
import { BufferAttribute, BufferGeometry } from 'three'
import { buildTerrainMesh, type MeshArrays, type MeshRequest } from './mesh'

let worker: Worker | null = null
let nextId = 0
const pending = new Map<number, { resolve: (m: MeshArrays) => void; reject: (e: Error) => void }>()

function getWorker(): Worker | null {
  if (worker || typeof Worker === 'undefined') return worker
  try {
    worker = new Worker(new URL('./terrain.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (e: MessageEvent<{ id: number; mesh?: MeshArrays; error?: string }>) => {
      const job = pending.get(e.data.id)
      pending.delete(e.data.id)
      if (!job) return
      if (e.data.mesh) job.resolve(e.data.mesh)
      else job.reject(new Error(e.data.error ?? 'terrain worker failed'))
    }
  } catch {
    worker = null // CSP or old browser: fall back to the main thread
  }
  return worker
}

/** Builds mesh arrays in the Web Worker (main thread fallback). */
export function buildInWorker(request: MeshRequest): Promise<MeshArrays> {
  const w = getWorker()
  if (!w) return Promise.resolve(buildTerrainMesh(request))
  const id = nextId++
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject })
    w.postMessage({ id, request })
  })
}

export function toGeometry(mesh: MeshArrays): BufferGeometry {
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(mesh.positions, 3))
  geo.setAttribute('normal', new BufferAttribute(mesh.normals, 3))
  geo.setAttribute('uv', new BufferAttribute(mesh.uvs, 2))
  geo.setIndex(new BufferAttribute(mesh.indices, 1))
  geo.computeBoundingSphere()
  geo.computeBoundingBox()
  return geo
}

/**
 * Builds a terrain geometry whenever the request key changes. The previous
 * geometry stays on screen until the new one is ready, then it is disposed.
 */
export function useTerrainGeometry(request: MeshRequest | null, key: string): BufferGeometry | null {
  const [geometry, setGeometry] = useState<BufferGeometry | null>(null)

  useEffect(() => {
    if (!request) {
      setGeometry(null)
      return
    }
    let cancelled = false
    buildInWorker(request)
      .then((mesh) => {
        if (!cancelled) setGeometry(toGeometry(mesh))
      })
      .catch((error) => console.error(error))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `key` captures the request identity
  }, [key])

  // Dispose each geometry once it has been replaced or the component unmounts.
  useEffect(() => () => geometry?.dispose(), [geometry])
  return geometry
}
