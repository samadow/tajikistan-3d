import type { Material, Object3D, Texture } from 'three'

/** Frees GPU memory held by an object tree (geometries, materials and their textures). */
export function disposeObject(root: Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as Object3D & { geometry?: { dispose: () => void }; material?: Material | Material[] }
    mesh.geometry?.dispose()
    const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : []
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && typeof value === 'object' && (value as Texture).isTexture) (value as Texture).dispose()
      }
      material.dispose()
    }
  })
}
