import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAppStore } from '../store/useAppStore'
import { api, type CatalogueQuery } from './client'

// Every query key includes the language, so switching language never shows
// cached content from another language (§11). keepPreviousData avoids flashes.
const STALE = 5 * 60_000

/** Light markers for the 3D map (all published landmarks). */
export function useLandmarks() {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['map', lang],
    queryFn: ({ signal }) => api.map(lang, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export function useLandmark(slug: string | null) {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['landmark', slug, lang],
    queryFn: ({ signal }) => api.landmark(slug!, lang, signal),
    enabled: !!slug,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export function useCategories() {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['categories', lang],
    queryFn: ({ signal }) => api.categories(lang, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export function useCatalogue(q: CatalogueQuery) {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['catalogue', lang, q],
    queryFn: ({ signal }) => api.catalogue(lang, q, signal),
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export function useFeatured() {
  const lang = useAppStore((s) => s.lang)
  return useQuery({ queryKey: ['featured', lang], queryFn: ({ signal }) => api.featured(lang, signal), staleTime: STALE })
}

export function useNearby(origin: { lat: number; lon: number; slug: string } | null) {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['nearby', lang, origin?.slug],
    queryFn: ({ signal }) => api.nearby(lang, origin!.lat, origin!.lon, origin!.slug, signal),
    enabled: !!origin,
    staleTime: STALE,
  })
}

export function useEraTimeline() {
  const lang = useAppStore((s) => s.lang)
  return useQuery({ queryKey: ['eras', lang], queryFn: ({ signal }) => api.eras(lang, signal), placeholderData: keepPreviousData, staleTime: STALE })
}

export function useStories() {
  const lang = useAppStore((s) => s.lang)
  return useQuery({ queryKey: ['stories', lang], queryFn: ({ signal }) => api.stories(lang, signal), placeholderData: keepPreviousData, staleTime: STALE })
}

export function useStory(slug: string | null) {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['story', slug, lang],
    queryFn: ({ signal }) => api.story(slug!, lang, signal),
    enabled: !!slug,
    placeholderData: keepPreviousData,
    staleTime: STALE,
  })
}

export function usePage(slug: string) {
  const lang = useAppStore((s) => s.lang)
  return useQuery({ queryKey: ['page', slug, lang], queryFn: ({ signal }) => api.page(slug, lang, signal), placeholderData: keepPreviousData, staleTime: STALE })
}
