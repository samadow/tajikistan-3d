import type { Category, Lang, LandmarkDetail, LandmarkSummary } from './types'

// Empty string = same origin (Vite proxy in dev, nginx in production).
const API_BASE = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/$/, '') ?? ''

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

async function get<T>(path: string, params: Record<string, string | undefined>, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) if (value) query.set(key, value)
  const res = await fetch(`${API_BASE}/api/${path}?${query}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new ApiError(res.status, `GET ${path} failed with ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  landmarks: (lang: Lang, signal?: AbortSignal) => get<LandmarkSummary[]>('landmarks/', { lang }, signal),
  landmark: (slug: string, lang: Lang, signal?: AbortSignal) =>
    get<LandmarkDetail>(`landmarks/${encodeURIComponent(slug)}/`, { lang }, signal),
  categories: (lang: Lang, signal?: AbortSignal) => get<Category[]>('categories/', { lang }, signal),
}
