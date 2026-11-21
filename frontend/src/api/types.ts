// Shapes returned by the Django REST API (backend/landmarks/serializers.py).

export type Lang = 'tg' | 'ru' | 'en'

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type PlaceholderKind =
  | 'fortress'
  | 'settlement'
  | 'lake'
  | 'lakes'
  | 'reservoir'
  | 'peak'
  | 'road'
  | 'stupa'
  | 'monument'

export interface Category {
  slug: string
  name: string
  color: string
  icon: string
  order: number
  landmark_count: number
}

export interface LandmarkSummary {
  slug: string
  name: string
  subtitle: string
  short_description: string
  category: string
  latitude: number
  longitude: number
  elevation_m: number
  position: Vec3
  camera: { position: Vec3; target: Vec3 }
  poster: string | null
  model_url: string | null
  placeholder: PlaceholderKind
  order: number
}

export interface LandmarkImage {
  id: number
  image: string
  caption: string
  credit: string
  width: number | null
  height: number | null
}

export interface Hotspot {
  id: number
  title: string
  text: string
  position: Vec3
}

export interface LandmarkEra {
  id: number
  label: string
  year: number
  description: string
  model_url: string | null
  placeholder_variant: 'restored' | 'ruins'
}

export interface LandmarkDetail extends Omit<LandmarkSummary, 'category'> {
  category: Category
  full_description: string
  best_season: string
  how_to_get_there: string
  model_scale: number
  model_credit: string
  poster_credit: string
  images: LandmarkImage[]
  hotspots: Hotspot[]
  eras: LandmarkEra[]
  updated_at: string
}
