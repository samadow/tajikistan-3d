// Copies the Draco and Basis (KTX2) decoders from three.js into public/ so the
// app does not depend on a third-party CDN at runtime.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const libs = resolve(root, 'node_modules/three/examples/jsm/libs')
if (!existsSync(libs)) process.exit(0)
for (const [from, to] of [['draco/gltf', 'public/decoders/draco'], ['basis', 'public/decoders/basis']]) {
  mkdirSync(resolve(root, to), { recursive: true })
  cpSync(resolve(libs, from), resolve(root, to), { recursive: true })
}
console.log('Copied Draco + Basis decoders to public/decoders')
