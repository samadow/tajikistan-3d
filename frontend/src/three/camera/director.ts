import gsap from 'gsap'
import { CatmullRomCurve3, MathUtils, Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { LandmarkMapItem } from '../../api/types'
import { prefersReducedMotion } from '../../lib/device'
import { sampleHeight, type TerrainData } from '../../lib/geo'
import { useAppStore } from '../../store/useAppStore'

/**
 * The "director" owns every scripted camera move: the intro, fly-to, the
 * map ↔ detail transition and the scroll-driven story path. React components
 * call these functions; the CameraRig registers the camera and controls.
 */

// Camera moves follow wall-clock time: on a slow frame the camera jumps ahead
// instead of the whole flight turning into slow motion.
gsap.ticker.lagSmoothing(0)

const DIRECTION = new Vector3(0, 0.72, 0.7).normalize()

/**
 * Overview framing, recomputed for the current viewport: the camera backs off
 * until the country fits horizontally. On wide screens the target sits west of
 * centre so the map clears the hero text on the left.
 */
export function overview() {
  const aspect = window.innerWidth / Math.max(window.innerHeight, 1)
  const fit = 40 / (Math.tan(MathUtils.degToRad(20)) * aspect)
  const distance = MathUtils.clamp(fit, 100, 240)
  const target = new Vector3(window.innerWidth >= 1024 ? -13 : -2, 0, aspect < 1 ? 6 : 2)
  return { position: target.clone().addScaledVector(DIRECTION, distance), target }
}

/** Detail framing: further away on narrow screens, where the model shares space with the panel. */
export function detailView() {
  const scale = window.innerWidth < 1024 ? 1.45 : 1
  return { position: new Vector3(8.4, 5.6, 11).multiplyScalar(scale), target: new Vector3(0, 0.8, 0) }
}

const INTRO_FROM = new Vector3(-20, 170, 170)

let camera: PerspectiveCamera | null = null
let controls: OrbitControlsImpl | null = null
let terrain: TerrainData | null = null
let tween: gsap.core.Tween | gsap.core.Timeline | null = null

export function registerCamera(cam: PerspectiveCamera, ctl: OrbitControlsImpl) {
  camera = cam
  controls = ctl
}

export function registerTerrain(data: TerrainData) {
  terrain = data
}

const store = () => useAppStore.getState()
const veilDuration = 450

function kill() {
  tween?.kill()
  tween = null
}

/** Where to put the camera for a landmark, corrected to the actual terrain height. */
export function landmarkFraming(lm: LandmarkMapItem, distanceScale = 1) {
  const groundY = terrain ? sampleHeight(terrain, lm.position.x, lm.position.z) : lm.position.y
  const target = new Vector3(lm.camera.target.x, groundY, lm.camera.target.z)
  const offset = new Vector3(
    lm.camera.position.x - lm.camera.target.x,
    lm.camera.position.y - lm.camera.target.y,
    lm.camera.position.z - lm.camera.target.z,
  ).multiplyScalar(distanceScale)
  return { position: target.clone().add(offset), target }
}

/**
 * Flies along an arc: position and target are interpolated together, and the
 * position is lifted in the middle so long flights rise above the mountains.
 */
export function flyTo(
  toPosition: Vector3,
  toTarget: Vector3,
  { duration = 2.4, lift = 1, onComplete }: { duration?: number; lift?: number; onComplete?: () => void } = {},
) {
  if (!camera || !controls) return
  kill()
  const cam = camera
  const ctl = controls
  const fromPos = cam.position.clone()
  const fromTarget = ctl.target.clone()
  const distance = fromPos.distanceTo(toPosition)
  const arc = Math.min(distance * 0.35, 40) * lift
  const state = { t: 0 }
  const d = prefersReducedMotion() ? 0.01 : duration
  tween = gsap.to(state, {
    t: 1,
    duration: d,
    ease: 'power3.inOut',
    onUpdate: () => {
      const t = state.t
      cam.position.lerpVectors(fromPos, toPosition, t)
      cam.position.y += Math.sin(Math.PI * t) * arc
      ctl.target.lerpVectors(fromTarget, toTarget, t)
      ctl.update()
    },
    onComplete,
  })
}

function setView(position: Vector3, target: Vector3) {
  if (!camera || !controls) return
  camera.position.copy(position)
  controls.target.copy(target)
  controls.update()
}

/** Opening shot after loading: drop from high orbit to the overview. */
export function intro(then?: () => void) {
  if (!camera || !controls) return
  setView(INTRO_FROM, overview().target)
  store().setMode('intro')
  flyTo(overview().position, overview().target, {
    duration: 3.6,
    lift: 0,
    onComplete: () => {
      store().setMode('map')
      then?.()
    },
  })
}

/** Map → fly to landmark → fade → detail stage. */
export function goToLandmark(lm: LandmarkMapItem) {
  const { mode, setMode, setVeil } = store()
  if (mode === 'detail') {
    // Switching between landmarks inside the detail view: just crossfade.
    setVeil(true)
    setTimeout(() => {
      setView(detailView().position.clone().multiplyScalar(1.4), detailView().target)
      setVeil(false)
      flyTo(detailView().position, detailView().target, { duration: 1.6, lift: 0 })
    }, veilDuration)
    return
  }
  setMode('flying')
  const { position, target } = landmarkFraming(lm)
  flyTo(position, target, {
    duration: 2.6,
    onComplete: () => {
      setVeil(true)
      setTimeout(() => {
        setMode('detail')
        setView(detailView().position.clone().multiplyScalar(1.6), detailView().target)
        setVeil(false)
        flyTo(detailView().position, detailView().target, { duration: 1.8, lift: 0 })
      }, veilDuration)
    },
  })
}

/** Detail → fade → back over the map → pull back to the overview. */
export function backToMap(from?: LandmarkMapItem) {
  const { mode, setMode, setVeil } = store()
  if (mode === 'map' || mode === 'intro') return
  const finish = () => {
    setMode('flying')
    flyTo(overview().position, overview().target, { duration: 2.4, onComplete: () => setMode('map') })
  }
  if (mode === 'detail') {
    setVeil(true)
    setTimeout(() => {
      setMode('flying')
      if (from) {
        const { position, target } = landmarkFraming(from)
        setView(position, target)
      }
      setVeil(false)
      finish()
    }, veilDuration)
  } else {
    finish()
  }
}

// --- Story mode ----------------------------------------------------------------

let storyPositions: CatmullRomCurve3 | null = null
let storyTargets: CatmullRomCurve3 | null = null
let storyKeys = 0

/** Builds a smooth camera path: overview → each landmark → overview. */
export function buildStoryPath(landmarks: LandmarkMapItem[]) {
  const positions = [overview().position.clone()]
  const targets = [overview().target.clone()]
  for (const lm of landmarks) {
    const framing = landmarkFraming(lm, 2)
    positions.push(framing.position)
    targets.push(framing.target)
  }
  positions.push(overview().position.clone().add(new Vector3(0, 6, 8)))
  targets.push(overview().target.clone())
  storyPositions = new CatmullRomCurve3(positions, false, 'centripetal')
  storyTargets = new CatmullRomCurve3(targets, false, 'centripetal')
  storyKeys = positions.length
}

const tmpPos = new Vector3()
const tmpTarget = new Vector3()

/**
 * progress 0..1 across all keys. Each segment is eased (smoothstep) so the
 * camera lingers at every landmark instead of moving at constant speed.
 */
export function setStoryProgress(progress: number) {
  if (!camera || !controls || !storyPositions || !storyTargets) return
  kill()
  const segments = storyKeys - 1
  const raw = MathUtils.clamp(progress, 0, 1) * segments
  const index = Math.min(Math.floor(raw), segments - 1)
  const local = raw - index
  const eased = local * local * (3 - 2 * local)
  const t = (index + eased) / segments
  storyPositions.getPoint(t, tmpPos)
  storyTargets.getPoint(t, tmpTarget)
  camera.position.copy(tmpPos)
  controls.target.copy(tmpTarget)
  controls.update()
  store().setStoryIndex(Math.round(raw))
}

export function enterStory() {
  store().setMode('story')
  if (storyPositions) {
    flyTo(storyPositions.getPoint(0), storyTargets!.getPoint(0), { duration: 1.4, lift: 0.4 })
  }
}

export function exitStory() {
  if (store().mode !== 'story') return
  store().setMode('flying')
  flyTo(overview().position, overview().target, { duration: 2, onComplete: () => store().setMode('map') })
}
