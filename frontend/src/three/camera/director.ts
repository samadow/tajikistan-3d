import gsap from 'gsap'
import { CatmullRomCurve3, MathUtils, Vector3, type PerspectiveCamera } from 'three'
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib'
import type { CameraFraming, LandmarkMapItem } from '../../api/types'
import { prefersReducedMotion } from '../../lib/device'
import type { TerrainData } from '../../lib/geo'
import { useAppStore } from '../../store/useAppStore'
import { GLOBE_RADIUS, TAJIKISTAN_DIR } from '../intro/Globe'
import { terrainHeightAt } from '../terrain/mesh'

/**
 * The director owns every scripted camera move (ADR-5): the globe intro, the
 * descent, fly-to, map ↔ detail, hotspot focus and the story spline.
 * OrbitControls owns user input and is disabled while a move runs. Starting
 * a move kills the previous one, so moves never compete.
 */

// Moves follow wall-clock time: slow devices skip frames instead of slow motion.
gsap.ticker.lagSmoothing(0)

const DIRECTION = new Vector3(0, 0.72, 0.7).normalize()
const VEIL_MS = 450

let camera: PerspectiveCamera | null = null
let controls: OrbitControlsImpl | null = null
let terrain: TerrainData | null = null
let tween: gsap.core.Tween | null = null
let savedView: { position: Vector3; target: Vector3 } | null = null
const timers = new Set<ReturnType<typeof setTimeout>>()

export function registerCamera(cam: PerspectiveCamera, ctl: OrbitControlsImpl) {
  camera = cam
  controls = ctl
}

export function registerTerrain(data: TerrainData) {
  terrain = data
}

const store = () => useAppStore.getState()

function later(fn: () => void, ms: number) {
  const id = setTimeout(() => {
    timers.delete(id)
    fn()
  }, ms)
  timers.add(id)
}

/** Stops any running move or pending step. */
export function stop() {
  tween?.kill()
  tween = null
  timers.forEach(clearTimeout)
  timers.clear()
}

/** Overview framing for the current viewport: backs off until the country fits. */
export function overview() {
  const aspect = window.innerWidth / Math.max(window.innerHeight, 1)
  const fit = 40 / (Math.tan(MathUtils.degToRad(20)) * aspect)
  const distance = MathUtils.clamp(fit, 100, 240)
  // On wide screens the target sits west of centre so the map clears the hero text.
  const target = new Vector3(window.innerWidth >= 1024 ? -13 : -2, 0, aspect < 1 ? 6 : 2)
  return { position: target.clone().addScaledVector(DIRECTION, distance), target }
}

/** Detail framing: further away on narrow screens, where the model shares space with the panel. */
export function detailView() {
  const scale = window.innerWidth < 1024 ? 1.45 : 1
  return { position: new Vector3(8.4, 5.6, 11).multiplyScalar(scale), target: new Vector3(0, 0.8, 0) }
}

/** Where to look at a landmark from, corrected to the real terrain height. */
export function landmarkFraming(framing: CameraFraming, distanceScale = 1) {
  const ground = terrain ? terrainHeightAt(terrain, framing.target.x, framing.target.z) : framing.target.y
  const target = new Vector3(framing.target.x, ground, framing.target.z)
  const offset = new Vector3(
    framing.position.x - framing.target.x,
    framing.position.y - framing.target.y,
    framing.position.z - framing.target.z,
  ).multiplyScalar(distanceScale)
  return { position: target.clone().add(offset), target }
}

/**
 * Flies along an arc: position and target are interpolated together and the
 * position is lifted mid-flight so long journeys rise above the mountains.
 */
export function flyTo(
  toPosition: Vector3,
  toTarget: Vector3,
  { duration = 2.4, lift = 1, ease = 'power3.inOut', onComplete }: { duration?: number; lift?: number; ease?: string; onComplete?: () => void } = {},
) {
  if (!camera || !controls) return
  tween?.kill()
  const cam = camera
  const ctl = controls
  const fromPos = cam.position.clone()
  const fromTarget = ctl.target.clone()
  const arc = Math.min(fromPos.distanceTo(toPosition) * 0.35, 40) * lift
  const state = { t: 0 }
  tween = gsap.to(state, {
    t: 1,
    duration: prefersReducedMotion() ? 0.01 : duration,
    ease,
    onUpdate: () => {
      cam.position.lerpVectors(fromPos, toPosition, state.t)
      cam.position.y += Math.sin(Math.PI * state.t) * arc
      ctl.target.lerpVectors(fromTarget, toTarget, state.t)
      ctl.update()
    },
    onComplete: () => {
      tween = null
      onComplete?.()
    },
  })
}

function setView(position: Vector3, target: Vector3) {
  if (!camera || !controls) return
  camera.position.copy(position)
  controls.target.copy(target)
  controls.update()
}

/** Fades the veil in, runs `swap` while the screen is covered, then fades out. */
function throughVeil(swap: () => void) {
  store().setVeil(true)
  later(() => {
    swap()
    store().setVeil(false)
  }, VEIL_MS)
}

// --- Intro ---------------------------------------------------------------------------

/**
 * Opening shot: Earth from space → approach Central Asia → veil → descend onto
 * the relief map. Reduced motion skips straight to the map.
 */
export function intro(then?: () => void) {
  if (!camera || !controls) return
  stop()
  if (prefersReducedMotion()) {
    skipIntro()
    then?.()
    return
  }
  const up = new Vector3(0, 1, 0)
  const start = TAJIKISTAN_DIR.clone().applyAxisAngle(up, -0.9).multiplyScalar(GLOBE_RADIUS * 4.2)
  setView(start, new Vector3(0, 0, 0))
  store().setMode('globe')
  flyTo(TAJIKISTAN_DIR.clone().multiplyScalar(GLOBE_RADIUS * 1.9), TAJIKISTAN_DIR.clone().multiplyScalar(GLOBE_RADIUS), {
    duration: 4.2,
    lift: 0,
    ease: 'power2.inOut',
    onComplete: () => descend(then),
  })
}

function descend(then?: () => void) {
  throughVeil(() => {
    store().setMode('intro')
    const o = overview()
    setView(new Vector3(o.target.x - 10, 170, o.target.z + 160), o.target)
    flyTo(o.position, o.target, {
      duration: 3.2,
      lift: 0,
      onComplete: () => {
        store().setMode('map')
        then?.()
      },
    })
  })
}

/** Jump straight to the map (skip button, reduced motion). */
export function skipIntro() {
  stop()
  store().setVeil(false)
  const o = overview()
  setView(o.position, o.target)
  store().setMode('map')
}

// --- Landmarks -------------------------------------------------------------------------

/** Map → arc flight to the landmark → veil → its own detail stage. */
export function goToLandmark(lm: LandmarkMapItem) {
  const { mode, setMode } = store()
  if (mode === 'detail') {
    // Landmark → landmark inside the detail view: crossfade only.
    stop()
    throughVeil(() => {
      const d = detailView()
      setView(d.position.clone().multiplyScalar(1.4), d.target)
      flyTo(d.position, d.target, { duration: 1.6, lift: 0 })
    })
    return
  }
  if (mode === 'map' && camera && controls) {
    savedView = { position: camera.position.clone(), target: controls.target.clone() }
  }
  stop()
  setMode('flying')
  const { position, target } = landmarkFraming(lm.camera)
  flyTo(position, target, {
    duration: 2.6,
    onComplete: () =>
      throughVeil(() => {
        setMode('detail')
        const d = detailView()
        setView(d.position.clone().multiplyScalar(1.6), d.target)
        flyTo(d.position, d.target, { duration: 1.8, lift: 0 })
      }),
  })
}

/** Detail → veil → above the landmark on the map → back to where the user was. */
export function backToMap(from?: LandmarkMapItem) {
  const { mode, setMode } = store()
  if (mode === 'map' || mode === 'globe' || mode === 'intro' || mode === 'loading') return
  const destination = savedView ?? overview()
  savedView = null
  const finish = () => {
    setMode('flying')
    flyTo(destination.position, destination.target, { duration: 2.4, onComplete: () => setMode('map') })
  }
  stop()
  if (mode === 'detail') {
    throughVeil(() => {
      setMode('flying')
      if (from) {
        const { position, target } = landmarkFraming(from.camera)
        setView(position, target)
      }
      finish()
    })
  } else {
    finish()
  }
}

// --- Hotspots --------------------------------------------------------------------------

/** Moves the detail camera towards a point on the model, keeping the viewing direction. */
export function focusPoint(point: Vector3, distance?: number | null) {
  if (!camera || !controls) return
  const dir = camera.position.clone().sub(controls.target).normalize()
  const d = distance ?? 4.5
  flyTo(point.clone().addScaledVector(dir, d), point.clone(), { duration: 1.2, lift: 0, ease: 'power2.inOut' })
}

export function resetFocus() {
  const d = detailView()
  flyTo(d.position, d.target, { duration: 1.2, lift: 0, ease: 'power2.inOut' })
}

// --- Story -----------------------------------------------------------------------------

let storyPositions: CatmullRomCurve3 | null = null
let storyTargets: CatmullRomCurve3 | null = null
let storyKeys = 0

/** Builds a smooth camera path: overview → each step → pulled-back overview. */
export function buildStoryPath(steps: CameraFraming[]) {
  const o = overview()
  const positions = [o.position.clone()]
  const targets = [o.target.clone()]
  for (const framing of steps) {
    const f = landmarkFraming(framing, 2)
    positions.push(f.position)
    targets.push(f.target)
  }
  positions.push(o.position.clone().add(new Vector3(0, 6, 8)))
  targets.push(o.target.clone())
  storyPositions = new CatmullRomCurve3(positions, false, 'centripetal')
  storyTargets = new CatmullRomCurve3(targets, false, 'centripetal')
  storyKeys = positions.length
}

const tmpPos = new Vector3()
const tmpTarget = new Vector3()

/**
 * Story progress 0..1 across all keys → camera. Each segment is eased so the
 * camera lingers at every stop; with reduced motion it snaps between stops.
 * Returns the index of the nearest key (0 = intro, 1..n = steps, n+1 = outro).
 */
export function setStoryProgress(progress: number): number {
  if (!camera || !controls || !storyPositions || !storyTargets) return 0
  tween?.kill()
  const segments = storyKeys - 1
  const raw = MathUtils.clamp(progress, 0, 1) * segments
  const index = Math.min(Math.floor(raw), segments - 1)
  const local = raw - index
  const eased = prefersReducedMotion() ? Math.round(local) : local * local * (3 - 2 * local)
  const t = (index + eased) / segments
  storyPositions.getPoint(t, tmpPos)
  storyTargets.getPoint(t, tmpTarget)
  camera.position.copy(tmpPos)
  controls.target.copy(tmpTarget)
  controls.update()
  return Math.round(raw)
}

export function enterStory() {
  stop()
  store().setMode('story')
  if (storyPositions && storyTargets) flyTo(storyPositions.getPoint(0), storyTargets.getPoint(0), { duration: 1.4, lift: 0.4 })
}

export function exitStory() {
  if (store().mode !== 'story') return
  stop()
  store().setMode('flying')
  const o = overview()
  flyTo(o.position, o.target, { duration: 2, onComplete: () => store().setMode('map') })
}
