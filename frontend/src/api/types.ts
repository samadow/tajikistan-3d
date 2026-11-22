// Shapes returned by the Django REST API v1 (backend/apps/*/serializers.py).
// The OpenAPI schema is served at /api/v1/schema/ (docs: /api/v1/docs/).

export type Lang = 'tg' | 'ru' | 'en'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export interface CameraFraming {
  position: Vec3
  target: Vec3
}

export type PlaceholderKind =
  | 'fortress'
  | 'settlement'
  | 'lake'
  | 'lakes'
  | 'reservoir'
  | 'peak'
  | 'range'
  | 'road'
  | 'stupa'
  | 'monument'

export interface GeoJSONPolygon {
  type: 'Polygon' | 'MultiPolygon'
  coordinates: number[][][] | number[][][][]
}

export interface Paginated<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export interface Category {
  slug: string
  name: string
  color: string
  icon: string
  order: number
  landmark_count: number
}

export interface CategoryRef {
  slug: string
  name: string
  color: string
}

export interface Source {
  id: number
  title: string
  author: string
  publisher: string
  year: number | null
  url: string
  citation: string
}

/** Light marker payload from /landmarks/map/. */
export interface LandmarkMapItem {
  slug: string
  name: string
  subtitle: string
  category: string
  latitude: number
  longitude: number
  elevation_m: number
  position: Vec3
  camera: CameraFraming
  placeholder: PlaceholderKind
  has_model: boolean
  is_featured: boolean
  order: number
  area_geojson: GeoJSONPolygon | null
}

/** Catalogue / featured / nearby card. */
export interface LandmarkCard {
  slug: string
  name: string
  subtitle: string
  short_description: string
  category: CategoryRef
  thumbnail: string | null
  latitude: number
  longitude: number
  elevation_m: number
  is_featured: boolean
  has_model: boolean
  distance_km: number | null
}

export type Lod = 'high' | 'medium' | 'low'

export interface ModelFile {
  id: number
  lod: Lod
  url: string
  size_bytes: number
  is_illustrative: boolean
  credit: string
  license: string
}

export interface LandmarkImage {
  id: number
  image: string
  thumbnail: string
  caption: string
  credit: string
  license: string
  width: number | null
  height: number | null
}

export interface Hotspot {
  id: number
  title: string
  text: string
  history: string
  image: string | null
  image_credit: string
  position: Vec3
  focus_distance: number | null
  sources: Source[]
}

export interface Era {
  id: number
  label: string
  year: number
  year_end: number | null
  year_is_approximate: boolean
  description: string
  placeholder_variant: 'restored' | 'ruins'
  models: ModelFile[]
  sources: Source[]
}

export interface LandmarkDetail extends Omit<LandmarkMapItem, 'category'> {
  category: CategoryRef
  short_description: string
  full_description: string
  history: string
  best_season: string
  how_to_get_there: string
  coordinates_source: string
  model_scale: number
  poster: string | null
  poster_thumbnail: string | null
  poster_credit: string
  models: ModelFile[]
  images: LandmarkImage[]
  hotspots: Hotspot[]
  eras: Era[]
  sources: Source[]
  updated_at: string
}

export interface EraTimelineItem {
  id: number
  label: string
  year: number
  year_end: number | null
  year_is_approximate: boolean
  description: string
  landmark: { slug: string; name: string; category: string }
  has_model: boolean
}

export interface StorySummary {
  slug: string
  title: string
  subtitle: string
  cover: string | null
  is_default: boolean
  step_count: number
}

export interface StoryStep {
  id: number
  order: number
  title: string
  text: string
  image: string | null
  image_credit: string
  landmark: LandmarkMapItem | null
  camera: CameraFraming | null
}

export interface StoryDetail extends StorySummary {
  intro: string
  steps: StoryStep[]
}

export interface SitePage {
  slug: string
  title: string
  lead: string
  body: string
  updated_at: string
}
