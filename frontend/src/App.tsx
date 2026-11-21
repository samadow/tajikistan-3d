import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useMatch } from 'react-router-dom'
import { useLandmarks } from './api/hooks'
import { useT } from './i18n/strings'
import { hasWebGL } from './lib/device'
import { useAppStore } from './store/useAppStore'
import { backToMap, enterStory, exitStory, goToLandmark, intro } from './three/camera/director'
import { DetailView } from './ui/DetailPanel'
import { Header } from './ui/Header'
import { Loader, Veil } from './ui/Loader'
import { Map2D } from './ui/Map2D'
import { MapOverlay } from './ui/MapOverlay'
import { StoryMode } from './ui/StoryMode'

// The 3D bundle (three, R3F, drei, postprocessing) loads in parallel with the UI.
const Experience = lazy(() => import('./three/Experience'))

/**
 * Keeps the 3D scene in step with the URL. The URL is the source of truth, so
 * deep links (/place/iskandarkul), the back button and sharing all work.
 */
function RouteSync() {
  const location = useLocation()
  const place = useMatch('/place/:slug')
  const slug = place?.params.slug ?? null
  const { data: landmarks } = useLandmarks()
  const terrainReady = useAppStore((s) => s.terrainReady)
  const select = useAppStore((s) => s.select)
  const started = useRef(false)
  const lastPath = useRef<string | null>(null)
  const lastSlug = useRef<string | null>(null)

  useEffect(() => {
    if (!terrainReady || !landmarks) return
    const path = location.pathname
    if (path === lastPath.current) return
    const previous = lastSlug.current ? landmarks.find((l) => l.slug === lastSlug.current) : undefined
    lastPath.current = path
    lastSlug.current = slug

    const target = slug ? landmarks.find((l) => l.slug === slug) : undefined
    select(slug)

    const act = () => {
      if (target) goToLandmark(target)
      else if (path === '/story') enterStory()
      else {
        exitStory()
        backToMap(previous)
      }
    }

    if (!started.current) {
      started.current = true
      // First visit: always play the intro, then continue to the requested route.
      intro(path === '/' ? undefined : act)
    } else {
      act()
    }
  }, [location.pathname, slug, terrainReady, landmarks, select])

  return null
}

export default function App() {
  const t = useT()
  const [webgl] = useState(hasWebGL)
  const [progress, setProgress] = useState(0)
  const terrainReady = useAppStore((s) => s.terrainReady)
  const veil = useAppStore((s) => s.veil)
  const { data: landmarks, isError, refetch } = useLandmarks()
  const place = useMatch('/place/:slug')
  const onProgress = useCallback((p: number) => setProgress(p), [])

  useEffect(() => {
    document.documentElement.lang = useAppStore.getState().lang
    // Expose the scene phase for CSS hooks and automated checks.
    return useAppStore.subscribe((s) => {
      document.body.dataset.mode = s.mode
    })
  }, [])

  const done = (webgl ? terrainReady : true) && (!!landmarks || isError)
  // Terrain decoding has no granular progress; count it as the first 70%.
  const combined = (terrainReady ? 70 : 35) + (progress / 100) * 30

  return (
    <>
      {webgl && (
        <Suspense fallback={null}>
          <Experience onProgress={onProgress} />
        </Suspense>
      )}
      {webgl && <RouteSync />}
      <Header webgl={webgl} />

      {webgl ? (
        <Routes>
          <Route path="/" element={<MapOverlay />} />
          <Route path="/place/:slug" element={null} />
          <Route path="/story" element={<StoryMode />} />
          <Route path="*" element={<MapOverlay />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="*" element={place ? null : <Map2D />} />
        </Routes>
      )}
      {place?.params.slug && <DetailView slug={place.params.slug} webgl={webgl} />}

      {isError && !landmarks && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4">
          <div className="glass flex items-center gap-4 rounded-full px-5 py-3 text-sm">
            {t('error')}
            <button type="button" className="text-gold-300 underline" onClick={() => refetch()}>
              {t('retry')}
            </button>
          </div>
        </div>
      )}

      <Veil active={veil} />
      <Loader progress={combined} done={done} />
      <div className="grain" aria-hidden />
    </>
  )
}
