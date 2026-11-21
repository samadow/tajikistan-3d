import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { useAppStore } from '../store/useAppStore'
import { api } from './client'

/** All published landmarks in the current language. Cached; refetched when the language changes. */
export function useLandmarks() {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['landmarks', lang],
    queryFn: ({ signal }) => api.landmarks(lang, signal),
    placeholderData: keepPreviousData, // keep markers on screen while switching language
    staleTime: 5 * 60_000,
  })
}

export function useLandmark(slug: string | null) {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['landmark', slug, lang],
    queryFn: ({ signal }) => api.landmark(slug!, lang, signal),
    enabled: !!slug,
    placeholderData: keepPreviousData,
    staleTime: 5 * 60_000,
  })
}

export function useCategories() {
  const lang = useAppStore((s) => s.lang)
  return useQuery({
    queryKey: ['categories', lang],
    queryFn: ({ signal }) => api.categories(lang, signal),
    placeholderData: keepPreviousData,
    staleTime: 10 * 60_000,
  })
}
