/// <reference lib="webworker" />
/** Builds terrain meshes off the main thread so the page never stalls. */
import { buildTerrainMesh, type MeshRequest } from './mesh'

self.onmessage = (event: MessageEvent<{ id: number; request: MeshRequest }>) => {
  const { id, request } = event.data
  try {
    const mesh = buildTerrainMesh(request)
    ;(self as DedicatedWorkerGlobalScope).postMessage({ id, mesh }, [
      mesh.positions.buffer,
      mesh.normals.buffer,
      mesh.uvs.buffer,
      mesh.indices.buffer,
    ])
  } catch (error) {
    ;(self as DedicatedWorkerGlobalScope).postMessage({ id, error: String(error) })
  }
}
