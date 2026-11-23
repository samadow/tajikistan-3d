import { useEffect, useRef } from 'react'
import { useLocation, useMatch } from 'react-router-dom'
import { useLandmarks, useStories, useStory } from '../api/hooks'
import type { CameraFraming } from '../api/types'
import { useAppStore } from '../store/useAppStore'
import { backToMap, buildStoryPath, enterStory, exitStory, focusPoint, goToLandmark, intro, resetFocus, setStoryProgress } from './camera/director'
import { hotspotPositions } from './detail/hotspotRegistry'

/**
 * Keeps the 3D scene in step with the URL — the URL is the source of truth, so
 * deep links (/place/iskandarkul, /story/grand-tour), back/forward and sharing work.
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
    // The real map (/map) has its own renderer; the paused scene keeps its last view.
    if (path === lastPath.current || path === '/map') return
    const previous = lastSlug.current ? landmarks.find((l) => l.slug === lastSlug.current) : undefined
    const wasStory = lastPath.current?.startsWith('/story') ?? false
    lastPath.current = path
    lastSlug.current = slug

    const target = slug ? landmarks.find((l) => l.slug === slug) : undefined
    const isStory = path.startsWith('/story')
    select(isStory ? null : slug)

    const act = () => {
      if (target) goToLandmark(target)
      else if (isStory) enterStory()
      else if (wasStory) exitStory()
      else backToMap(previous)
    }

    if (!started.current) {
      started.current = true
      // First visit: always play the intro, then continue to the requested route.
      intro(path === '/' || !(target || isStory) ? undefined : act)
    } else {
      act()
    }
  }, [location.pathname, slug, terrainReady, landmarks, select])

  return null
}

/** Builds the story camera path from the CMS story and follows scroll progress. */
function StoryCamera() {
  const match = useMatch('/story/:slug')
  const onStory = useMatch('/story') !== null || match !== null
  const { data: stories } = useStories()
  const requested = match?.params.slug ?? null
  const fallback = stories?.find((s) => s.is_default)?.slug ?? stories?.[0]?.slug ?? null
  const slug = onStory ? (requested ?? fallback) : null
  const { data: story } = useStory(slug)
  const { data: landmarks } = useLandmarks()
  const terrainReady = useAppStore((s) => s.terrainReady)
  const setStory = useAppStore((s) => s.setStory)

  useEffect(() => {
    setStory(slug)
  }, [slug, setStory])

  // Steps → camera keyframes (explicit keyframe, or the landmark's fly-to framing).
  useEffect(() => {
    if (!story || !terrainReady) return
    const frames: CameraFraming[] = []
    for (const step of story.steps) {
      if (step.camera) frames.push(step.camera)
      else if (step.landmark) frames.push(step.landmark.camera)
    }
    buildStoryPath(frames)
  }, [story, terrainReady])

  useEffect(
    () =>
      useAppStore.subscribe((state, prev) => {
        if (state.mode !== 'story' || state.storyProgress === prev.storyProgress || !story) return
        const index = setStoryProgress(state.storyProgress)
        if (index !== state.storyIndex) {
          state.setStoryIndex(index)
          // Highlight the current stop's marker and stream its detail relief.
          const step = story.steps[index - 1]
          const lm = step?.landmark ? landmarks?.find((l) => l.slug === step.landmark!.slug) : null
          useAppStore.setState({ selectedSlug: lm?.slug ?? null })
        }
      }),
    [story, landmarks],
  )
  return null
}

/** Flies to a hotspot when one is opened, and back to the full model when it is closed. */
function HotspotFocus() {
  useEffect(
    () =>
      useAppStore.subscribe((state, prev) => {
        if (state.activeHotspot === prev.activeHotspot || state.mode !== 'detail') return
        if (state.activeHotspot !== null) {
          const spot = hotspotPositions.get(state.activeHotspot)
          if (spot) focusPoint(spot.position, spot.distance)
        } else {
          resetFocus()
        }
      }),
    [],
  )
  return null
}

export function SceneController() {
  return (
    <>
      <RouteSync />
      <StoryCamera />
      <HotspotFocus />
    </>
  )
}
