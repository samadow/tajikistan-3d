/**
 * DOM shell. It never imports from ./three — the 3D chunk (three.js, R3F,
 * drei, GSAP) is loaded lazily, so the 2D fallback stays light (audit D2).
 */
import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Route, Routes, useLocation, useMatch } from 'react-router-dom'
import { useLandmarks } from './api/hooks'
import { useT } from './i18n/strings'
import { hasWebGL } from './lib/device'
import { Ambience } from './lib/sound'
import { useAppStore } from './store/useAppStore'
import { DetailView } from './ui/detail/DetailView'
import { Header } from './ui/Header'
import { Loader, Veil } from './ui/Loader'
import { Map2D } from './ui/Map2D'
import { GlobeCaption, MapOverlay } from './ui/MapOverlay'
import { Spinner } from './ui/pages/PageShell'
import { SearchPalette } from './ui/SearchPalette'

const ThreeRoot = lazy(() => import('./three/ThreeRoot'))
const StoryMode = lazy(() => import('./ui/StoryMode'))
const Discover = lazy(() => import('./ui/pages/Discover'))
const History = lazy(() => import('./ui/pages/History'))
const Stories = lazy(() => import('./ui/pages/Stories'))
const About = lazy(() => import('./ui/pages/About'))
const RealMap = lazy(() => import('./realmap/RealMap'))

/** Ambient sound follows the toggle and the scene phase. */
function SoundController() {
  const soundOn = useAppStore((s) => s.soundOn)
  const mode = useAppStore((s) => s.mode)
  const ambience = useRef<Ambience | null>(null)
  useEffect(() => {
    if (!soundOn) {
      ambience.current?.stop()
      return
    }
    ambience.current ??= new Ambience()
    ambience.current.start()
  }, [soundOn])
  useEffect(() => {
    ambience.current?.setMood(mode === 'globe' ? 'space' : mode === 'detail' ? 'detail' : 'map')
  }, [mode])
  useEffect(() => () => ambience.current?.dispose(), [])
  return null
}

function Pages() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/discover" element={<Discover />} />
        <Route path="/history" element={<History />} />
        <Route path="/stories" element={<Stories />} />
        <Route path="/about" element={<About />} />
        <Route path="/map" element={<RealMap />} />
        <Route path="*" element={null} />
      </Routes>
    </Suspense>
  )
}

export default function App() {
  const t = useT()
  const [webglSupported] = useState(hasWebGL)
  const webglFailed = useAppStore((s) => s.webglFailed)
  const webgl = webglSupported && !webglFailed
  const terrainReady = useAppStore((s) => s.terrainReady)
  const loadProgress = useAppStore((s) => s.loadProgress)
  const veil = useAppStore((s) => s.veil)
  const { data: landmarks, isError, refetch } = useLandmarks()
  const place = useMatch('/place/:slug')
  const location = useLocation()
  const [searchOpen, setSearchOpen] = useState(false)
  const isStory = location.pathname.startsWith('/story')
  const isPage = ['/discover', '/history', '/stories', '/about'].includes(location.pathname)
  const isRealMap = location.pathname === '/map'
  // The 3D scene is not needed on the real map: a direct visit never downloads it,
  // and once it exists it is paused (kept in memory so going back is instant).
  const [sceneWanted, setSceneWanted] = useState(!isRealMap)
  useEffect(() => {
    if (!isRealMap) setSceneWanted(true)
  }, [isRealMap])

  useEffect(() => {
    document.documentElement.lang = useAppStore.getState().lang
    // Expose the scene phase for CSS hooks and end-to-end tests.
    return useAppStore.subscribe((s) => {
      document.body.dataset.mode = s.mode
    })
  }, [])

  useEffect(() => {
    if (!isPage && !place && !isRealMap) document.title = `${t('brand')} 3D`
  }, [isPage, place, isRealMap, t])

  // Ctrl+K or "/" opens search.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea')
      if ((e.key === 'k' && (e.ctrlKey || e.metaKey)) || (e.key === '/' && !typing)) {
        e.preventDefault()
        setSearchOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Content pages do not need the relief, so they are not held behind the loader.
  const done = (webgl && !isPage && !isRealMap ? terrainReady : true) && (!!landmarks || isError)
  // Terrain decoding has no granular progress: count it as the first 70 %.
  const progress = (terrainReady ? 70 : 35) + (loadProgress / 100) * 30

  return (
    <>
      <a href="#content" className="sr-only z-[60] rounded-full bg-gold-400 px-4 py-2 text-ink-900 focus:not-sr-only focus:fixed focus:left-4 focus:top-4">
        {t('skipToContent')}
      </a>

      {webgl && sceneWanted && (
        <Suspense fallback={null}>
          <ThreeRoot paused={isRealMap} />
        </Suspense>
      )}
      <Header webgl={webgl} onSearch={() => setSearchOpen(true)} />

      {webgl ? (
        <>
          {location.pathname === '/' && <MapOverlay />}
          {!isRealMap && <GlobeCaption />}
          {isStory && (
            <Suspense fallback={null}>
              <StoryMode />
            </Suspense>
          )}
        </>
      ) : (
        !place && !isPage && !isRealMap && <Map2D />
      )}
      <Pages />
      {place?.params.slug && <DetailView slug={place.params.slug} webgl={webgl} />}

      {isError && !landmarks && (
        <div className="fixed inset-x-0 bottom-6 z-40 flex justify-center px-4" role="alert">
          <div className="glass flex items-center gap-4 rounded-full px-5 py-3 text-sm">
            {t('error')}
            <button type="button" className="text-gold-300 underline" onClick={() => refetch()}>
              {t('retry')}
            </button>
          </div>
        </div>
      )}

      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
      <SoundController />
      <Veil active={veil} />
      <Loader progress={webgl ? progress : 100} done={done} />
      <div className="grain" aria-hidden />
    </>
  )
}
