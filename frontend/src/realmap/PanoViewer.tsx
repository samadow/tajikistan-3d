/**
 * Equirectangular 360° panorama viewer: the image is mapped on the inside of a
 * sphere. Drag (mouse / touch) to look around, wheel or pinch to zoom, arrow
 * keys when focused. Slow auto-rotation until the first interaction, unless
 * the user prefers reduced motion.
 */
import { useEffect, useRef, useState } from 'react'
import {
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  WebGLRenderer,
} from 'three'
import { useT } from '../i18n/strings'

export function PanoViewer({ src, label }: { src: string; label: string }) {
  const t = useT()
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading')

  useEffect(() => {
    const el = host.current
    if (!el) return
    setState('loading')
    let renderer: WebGLRenderer
    try {
      renderer = new WebGLRenderer({ antialias: true })
    } catch {
      setState('error')
      return
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.outputColorSpace = SRGBColorSpace
    el.appendChild(renderer.domElement)
    renderer.domElement.style.touchAction = 'none'

    const scene = new Scene()
    const camera = new PerspectiveCamera(75, 1, 0.1, 100)
    const geometry = new SphereGeometry(50, 96, 48)
    geometry.scale(-1, 1, 1) // look at the inside of the sphere
    const material = new MeshBasicMaterial({ color: 0x111111 })
    scene.add(new Mesh(geometry, material))

    let disposed = false
    const loader = new TextureLoader()
    loader.setCrossOrigin('anonymous')
    loader.load(
      src,
      (texture) => {
        if (disposed) return texture.dispose()
        texture.colorSpace = SRGBColorSpace
        texture.minFilter = LinearFilter
        texture.generateMipmaps = false
        texture.anisotropy = renderer.capabilities.getMaxAnisotropy()
        material.map = texture
        material.color.set(0xffffff)
        material.needsUpdate = true
        setState('ready')
      },
      undefined,
      () => !disposed && setState('error'),
    )

    let lon = 0
    let lat = 0
    let auto = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const pointers = new Map<number, { x: number; y: number }>()
    let pinch = 0

    const resize = () => {
      const { clientWidth: w, clientHeight: h } = el
      renderer.setSize(w, h, false)
      renderer.domElement.style.width = '100%'
      renderer.domElement.style.height = '100%'
      camera.aspect = w / Math.max(h, 1)
      camera.updateProjectionMatrix()
    }
    const observer = new ResizeObserver(resize)
    observer.observe(el)
    resize()

    const zoom = (delta: number) => {
      camera.fov = Math.min(100, Math.max(25, camera.fov + delta))
      camera.updateProjectionMatrix()
    }
    const onDown = (e: PointerEvent) => {
      auto = false
      renderer.domElement.setPointerCapture(e.pointerId)
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId)
      if (!prev) return
      if (pointers.size === 2) {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
        const [a, b] = [...pointers.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (pinch) zoom((pinch - d) * 0.1)
        pinch = d
        return
      }
      // Degrees per pixel follow the field of view, so dragging feels the same at any zoom.
      const k = camera.fov / el.clientHeight
      lon -= (e.clientX - prev.x) * k
      lat += (e.clientY - prev.y) * k
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    }
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId)
      pinch = 0
    }
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      auto = false
      zoom(e.deltaY * 0.03)
    }
    const onKey = (e: KeyboardEvent) => {
      const step = { ArrowLeft: [-5, 0], ArrowRight: [5, 0], ArrowUp: [0, 5], ArrowDown: [0, -5] }[e.key]
      if (step) {
        e.preventDefault()
        auto = false
        lon += step[0]
        lat += step[1]
      } else if (e.key === '+' || e.key === '=') zoom(-5)
      else if (e.key === '-') zoom(5)
    }
    const canvas = renderer.domElement
    canvas.addEventListener('pointerdown', onDown)
    canvas.addEventListener('pointermove', onMove)
    canvas.addEventListener('pointerup', onUp)
    canvas.addEventListener('pointercancel', onUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('keydown', onKey)

    const target = new Vector3()
    let frame = 0
    const tick = () => {
      frame = requestAnimationFrame(tick)
      if (auto) lon += 0.03
      lat = Math.max(-85, Math.min(85, lat))
      const phi = ((90 - lat) * Math.PI) / 180
      const theta = (lon * Math.PI) / 180
      target.set(Math.sin(phi) * Math.cos(theta), Math.cos(phi), Math.sin(phi) * Math.sin(theta))
      camera.lookAt(target)
      renderer.render(scene, camera)
    }
    tick()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      observer.disconnect()
      el.removeEventListener('keydown', onKey)
      material.map?.dispose()
      material.dispose()
      geometry.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [src])

  return (
    <div
      ref={host}
      tabIndex={0}
      role="img"
      aria-label={`${label}. ${t('dragToLook')}`}
      className="relative h-full w-full cursor-grab overflow-hidden bg-black outline-none active:cursor-grabbing"
    >
      {state === 'loading' && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <span className="h-10 w-10 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      )}
      {state === 'error' && <p className="absolute inset-0 grid place-items-center text-sm text-white/80">{t('imageFailed')}</p>}
      {state === 'ready' && (
        <p className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white/90">
          {t('dragToLook')}
        </p>
      )}
    </div>
  )
}
