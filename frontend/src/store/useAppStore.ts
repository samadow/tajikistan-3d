import { create } from 'zustand'
import type { Lang } from '../api/types'
import { detectQuality, type Quality } from '../lib/device'

/**
 * Scene phases:
 *  intro   – opening camera move after loading
 *  map     – free exploration of the relief map
 *  flying  – camera is travelling to a landmark
 *  detail  – the landmark's own model stage is shown
 *  story   – scroll-driven guided tour
 */
export type Mode = 'intro' | 'map' | 'flying' | 'detail' | 'story'
export type TimeOfDay = 'day' | 'night'

const LANG_KEY = 'tj3d.lang'

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY)
    if (saved === 'tg' || saved === 'ru' || saved === 'en') return saved
  } catch {
    /* storage unavailable (private mode) — fall through */
  }
  return 'tg'
}

interface AppState {
  lang: Lang
  mode: Mode
  selectedSlug: string | null
  hoveredSlug: string | null
  category: string | null
  timeOfDay: TimeOfDay
  quality: Quality
  eraIndex: number
  activeHotspot: number | null
  veil: boolean
  terrainReady: boolean
  storyIndex: number

  setLang: (lang: Lang) => void
  setMode: (mode: Mode) => void
  select: (slug: string | null) => void
  hover: (slug: string | null) => void
  setCategory: (slug: string | null) => void
  toggleTimeOfDay: () => void
  setQuality: (q: Quality) => void
  setEraIndex: (i: number) => void
  setActiveHotspot: (id: number | null) => void
  setVeil: (v: boolean) => void
  setTerrainReady: () => void
  setStoryIndex: (i: number) => void
}

export const useAppStore = create<AppState>((set) => ({
  lang: initialLang(),
  mode: 'intro',
  selectedSlug: null,
  hoveredSlug: null,
  category: null,
  timeOfDay: 'day',
  quality: detectQuality(),
  eraIndex: 0,
  activeHotspot: null,
  veil: false,
  terrainReady: false,
  storyIndex: 0,

  setLang: (lang) => {
    try {
      localStorage.setItem(LANG_KEY, lang)
    } catch {
      /* ignore */
    }
    document.documentElement.lang = lang
    set({ lang })
  },
  setMode: (mode) => set({ mode }),
  select: (selectedSlug) => set({ selectedSlug, eraIndex: 0, activeHotspot: null }),
  hover: (hoveredSlug) => set({ hoveredSlug }),
  setCategory: (category) => set({ category }),
  toggleTimeOfDay: () => set((s) => ({ timeOfDay: s.timeOfDay === 'day' ? 'night' : 'day' })),
  setQuality: (quality) => set({ quality }),
  setEraIndex: (eraIndex) => set({ eraIndex }),
  setActiveHotspot: (activeHotspot) => set({ activeHotspot }),
  setVeil: (veil) => set({ veil }),
  setTerrainReady: () => set({ terrainReady: true }),
  setStoryIndex: (storyIndex) => set({ storyIndex }),
}))
