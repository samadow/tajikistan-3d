import { create } from 'zustand'
import type { Lang } from '../api/types'
import { detectQuality, type Quality } from '../lib/device'

/**
 * Scene phases (see the state diagram in ARCHITECTURE.md):
 *  globe   – opening shot: Earth from space, approaching Central Asia
 *  intro   – descent onto the relief map
 *  map     – free exploration
 *  flying  – camera travelling (fly-to / return)
 *  detail  – a landmark's own 3D stage
 *  story   – scroll-driven guided tour
 */
export type Mode = 'loading' | 'globe' | 'intro' | 'map' | 'flying' | 'detail' | 'story'
export type TimeOfDay = 'day' | 'night'
export type QualitySetting = Quality | 'auto'

const LANG_KEY = 'tj3d.lang'
const QUALITY_KEY = 'tj3d.quality'
const SOUND_KEY = 'tj3d.sound'

function read(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null // storage unavailable (private mode, blocked site data)
  }
}

function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* ignore */
  }
}

function initialLang(): Lang {
  // A shared link may carry ?lang=; otherwise the visitor's last choice; otherwise Tajik.
  const param = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : null
  const saved = param ?? read(LANG_KEY)
  return saved === 'tg' || saved === 'ru' || saved === 'en' ? saved : 'tg'
}

function initialQualitySetting(): QualitySetting {
  const param = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('quality') : null
  const saved = param ?? read(QUALITY_KEY)
  return saved === 'high' || saved === 'medium' || saved === 'low' ? saved : 'auto'
}

const qualitySetting = initialQualitySetting()

interface AppState {
  lang: Lang
  mode: Mode
  selectedSlug: string | null
  hoveredSlug: string | null
  category: string | null
  timeOfDay: TimeOfDay
  /** What the user chose (auto = detect + adapt to frame rate). */
  qualitySetting: QualitySetting
  /** What is actually rendered. */
  quality: Quality
  eraIndex: number
  compareEras: boolean
  activeHotspot: number | null
  veil: boolean
  terrainReady: boolean
  /** WebGL context lost or the scene crashed → show the 2D interface. */
  webglFailed: boolean
  /** The user has touched the map (collapses the hero on small screens). */
  interacted: boolean
  storySlug: string | null
  storyProgress: number
  storyIndex: number
  soundOn: boolean
  /** three.js loader progress 0..100 (textures, models). */
  loadProgress: number

  setLang: (lang: Lang) => void
  setMode: (mode: Mode) => void
  select: (slug: string | null) => void
  hover: (slug: string | null) => void
  setCategory: (slug: string | null) => void
  toggleTimeOfDay: () => void
  setQualitySetting: (q: QualitySetting) => void
  degradeQuality: () => void
  setEraIndex: (i: number) => void
  toggleCompare: () => void
  setActiveHotspot: (id: number | null) => void
  setVeil: (v: boolean) => void
  setTerrainReady: () => void
  failWebgl: () => void
  markInteracted: () => void
  setStory: (slug: string | null) => void
  setStoryProgress: (p: number) => void
  setStoryIndex: (i: number) => void
  toggleSound: () => void
  setLoadProgress: (p: number) => void
}

export const useAppStore = create<AppState>((set, get) => ({
  lang: initialLang(),
  mode: 'loading',
  selectedSlug: null,
  hoveredSlug: null,
  category: null,
  timeOfDay: 'day',
  qualitySetting,
  quality: qualitySetting === 'auto' ? detectQuality() : qualitySetting,
  eraIndex: 0,
  compareEras: false,
  activeHotspot: null,
  veil: false,
  terrainReady: false,
  webglFailed: false,
  interacted: false,
  storySlug: null,
  storyProgress: 0,
  storyIndex: 0,
  soundOn: read(SOUND_KEY) === '1',
  loadProgress: 0,

  setLang: (lang) => {
    write(LANG_KEY, lang)
    document.documentElement.lang = lang
    set({ lang })
  },
  setMode: (mode) => set({ mode }),
  select: (selectedSlug) => set({ selectedSlug, eraIndex: 0, activeHotspot: null, compareEras: false }),
  hover: (hoveredSlug) => set({ hoveredSlug }),
  setCategory: (category) => set({ category }),
  toggleTimeOfDay: () => set((s) => ({ timeOfDay: s.timeOfDay === 'day' ? 'night' : 'day' })),
  setQualitySetting: (q) => {
    write(QUALITY_KEY, q)
    set({ qualitySetting: q, quality: q === 'auto' ? detectQuality() : q })
  },
  degradeQuality: () => {
    // Only the automatic setting adapts; a manual choice is respected.
    if (get().qualitySetting !== 'auto') return
    const q = get().quality
    if (q !== 'low') set({ quality: q === 'high' ? 'medium' : 'low' })
  },
  setEraIndex: (eraIndex) => set({ eraIndex }),
  toggleCompare: () => set((s) => ({ compareEras: !s.compareEras, activeHotspot: null })),
  setActiveHotspot: (activeHotspot) => set({ activeHotspot }),
  setVeil: (veil) => set({ veil }),
  setTerrainReady: () => set({ terrainReady: true }),
  failWebgl: () => set({ webglFailed: true }),
  markInteracted: () => {
    if (!get().interacted) set({ interacted: true })
  },
  setStory: (storySlug) => set({ storySlug, storyProgress: 0, storyIndex: 0 }),
  setStoryProgress: (storyProgress) => set({ storyProgress }),
  setStoryIndex: (storyIndex) => set({ storyIndex }),
  toggleSound: () =>
    set((s) => {
      write(SOUND_KEY, s.soundOn ? '0' : '1')
      return { soundOn: !s.soundOn }
    }),
  setLoadProgress: (loadProgress) => set({ loadProgress }),
}))
