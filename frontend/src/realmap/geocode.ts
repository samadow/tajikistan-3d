/**
 * Place search and reverse geocoding with Photon (komoot), an open geocoder
 * over OpenStreetMap data. Searches are limited to Tajikistan.
 */
import type { Lang } from '../api/types'
import { TJ_BOUNDS } from './style'

const PHOTON = 'https://photon.komoot.io'

export interface PlaceResult {
  id: string
  name: string
  detail: string
  kind: string
  lat: number
  lon: number
  /** [west, south, east, north] when the place has an area. */
  bbox?: [number, number, number, number]
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] }
  properties: {
    osm_id?: number
    osm_type?: string
    osm_key?: string
    osm_value?: string
    name?: string
    street?: string
    housenumber?: string
    district?: string
    locality?: string
    city?: string
    county?: string
    state?: string
    country?: string
    countrycode?: string
    extent?: [number, number, number, number]
    type?: string
  }
}

// Photon has label languages default/en/de/fr; "default" returns the local
// (Tajik or Russian) names used in Tajikistan.
const photonLang = (lang: Lang) => (lang === 'en' ? 'en' : 'default')

function toResult(f: PhotonFeature): PlaceResult {
  const p = f.properties
  const [lon, lat] = f.geometry.coordinates
  const street = [p.street, p.housenumber].filter(Boolean).join(' ')
  const name = p.name || street || p.city || p.state || ''
  const detail = [p.name ? street : '', p.district, p.city ?? p.locality, p.state].filter((x) => x && x !== name).join(', ')
  // Photon extent is [minLon, maxLat, maxLon, minLat].
  const e = p.extent
  return {
    id: `${p.osm_type}${p.osm_id}`,
    name,
    detail,
    kind: p.osm_value ?? p.type ?? '',
    lat,
    lon,
    bbox: e ? [e[0], e[3], e[2], e[1]] : undefined,
  }
}

export async function searchPlaces(query: string, lang: Lang, signal?: AbortSignal): Promise<PlaceResult[]> {
  const params = new URLSearchParams({ q: query, limit: '8', lang: photonLang(lang), bbox: TJ_BOUNDS.join(',') })
  const res = await fetch(`${PHOTON}/api/?${params}`, { signal })
  if (!res.ok) throw new Error(`photon ${res.status}`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  const seen = new Set<string>()
  // OSM splits long streets into many ways: show each name + area once.
  return data.features
    .filter((f) => !f.properties.countrycode || f.properties.countrycode === 'TJ')
    .map(toResult)
    .filter((r) => {
      const key = `${r.name}|${r.detail}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}

export async function reverseGeocode(lat: number, lon: number, lang: Lang, signal?: AbortSignal): Promise<PlaceResult | null> {
  const params = new URLSearchParams({ lat: String(lat), lon: String(lon), lang: photonLang(lang), limit: '1' })
  const res = await fetch(`${PHOTON}/reverse?${params}`, { signal })
  if (!res.ok) throw new Error(`photon ${res.status}`)
  const data = (await res.json()) as { features: PhotonFeature[] }
  return data.features[0] ? toResult(data.features[0]) : null
}

/** Zoom level that frames a place of this kind when it has no area. */
export function zoomFor(kind: string): number {
  if (['country', 'state'].includes(kind)) return 6
  if (['city', 'county', 'region'].includes(kind)) return 11.5
  if (['town', 'district', 'suburb'].includes(kind)) return 13
  if (['village', 'hamlet', 'peak', 'lake', 'reservoir', 'water'].includes(kind)) return 13.5
  if (['house', 'building', 'residential', 'yes'].includes(kind)) return 18
  return 16.5
}
