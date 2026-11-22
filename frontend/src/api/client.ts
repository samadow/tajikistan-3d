import type {
  Category,
  EraTimelineItem,
  Lang,
  LandmarkCard,
  LandmarkDetail,
  LandmarkMapItem,
  Paginated,
  SitePage,
  StoryDetail,
  StorySummary,
} from './types'

// Empty string = same origin (Vite proxy in dev, nginx in production).
const API_BASE = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
export const API_PREFIX = `${API_BASE}/api/v1`

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
  }
}

type Params = Record<string, string | number | boolean | undefined | null>

async function get<T>(path: string, params: Params, signal?: AbortSignal): Promise<T> {
  const query = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value))
  }
  const res = await fetch(`${API_PREFIX}/${path}?${query}`, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) throw new ApiError(res.status, `GET ${path} failed with ${res.status}`)
  return res.json() as Promise<T>
}

export interface CatalogueQuery {
  search?: string
  category?: string | null
  featured?: boolean
  page?: number
  page_size?: number
}

export const api = {
  map: (lang: Lang, signal?: AbortSignal) => get<LandmarkMapItem[]>('landmarks/map/', { lang }, signal),
  catalogue: (lang: Lang, q: CatalogueQuery, signal?: AbortSignal) =>
    get<Paginated<LandmarkCard>>('landmarks/', { lang, ...q }, signal),
  featured: (lang: Lang, signal?: AbortSignal) => get<LandmarkCard[]>('landmarks/featured/', { lang }, signal),
  nearby: (lang: Lang, lat: number, lon: number, exclude?: string, signal?: AbortSignal) =>
    get<LandmarkCard[]>('landmarks/nearby/', { lang, lat, lon, exclude, radius_km: 150, limit: 4 }, signal),
  landmark: (slug: string, lang: Lang, signal?: AbortSignal) =>
    get<LandmarkDetail>(`landmarks/${encodeURIComponent(slug)}/`, { lang }, signal),
  categories: (lang: Lang, signal?: AbortSignal) => get<Category[]>('categories/', { lang }, signal),
  eras: (lang: Lang, signal?: AbortSignal) => get<EraTimelineItem[]>('eras/', { lang }, signal),
  stories: (lang: Lang, signal?: AbortSignal) => get<StorySummary[]>('stories/', { lang }, signal),
  story: (slug: string, lang: Lang, signal?: AbortSignal) =>
    get<StoryDetail>(`stories/${encodeURIComponent(slug)}/`, { lang }, signal),
  page: (slug: string, lang: Lang, signal?: AbortSignal) =>
    get<SitePage>(`pages/${encodeURIComponent(slug)}/`, { lang }, signal),
}
