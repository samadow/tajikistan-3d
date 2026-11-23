/**
 * Style of the real map, built on the OpenFreeMap "Liberty" style
 * (OpenStreetMap data in the OpenMapTiles schema) plus:
 *   - a satellite raster layer (hybrid mode: imagery + roads + labels + 3D buildings),
 *   - AWS Terrain Tiles for 3D relief and hillshading,
 *   - the national border highlight and the platform's own landmarks,
 *   - Mapillary street-imagery coverage when a token is configured.
 */
import type {
  ExpressionSpecification,
  LayerSpecification,
  Map as MlMap,
  StyleSpecification,
} from 'maplibre-gl'
import type { Lang, MapConfig } from '../api/types'

export const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty'
const TERRARIUM = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'
const DEM_ATTRIBUTION = '<a href="https://registry.opendata.aws/terrain-tiles/" target="_blank" rel="noopener">AWS Terrain Tiles</a>'

/** [west, south, east, north] of Tajikistan with a small margin. */
export const TJ_BOUNDS: [number, number, number, number] = [67.2, 36.6, 75.2, 41.1]
export const TJ_CENTER: [number, number] = [71.1, 38.7]

export type BaseLayer = 'map' | 'satellite' | 'terrain'

/** Fills that would hide the imagery in satellite (hybrid) mode. */
const HYBRID_HIDDEN = /^(background|natural_earth|park$|landuse_|landcover_|water$|aeroway_fill|road_area_pattern|building$)/

export const LANDMARK_LAYERS = ['lm-dot', 'lm-label']
export const POI_LAYERS = ['poi_r20', 'poi_r7', 'poi_r1', 'poi_transit', 'airport', 'label_city_capital', 'label_city', 'label_town', 'label_village', 'label_other', 'water_name_point_label']
export const MAPILLARY_LAYERS = ['mly-seq', 'mly-img']

let baseStyle: Promise<StyleSpecification> | null = null
export function loadBaseStyle(): Promise<StyleSpecification> {
  baseStyle ??= fetch(STYLE_URL).then((r) => {
    if (!r.ok) throw new Error(`style ${r.status}`)
    return r.json() as Promise<StyleSpecification>
  })
  baseStyle.catch(() => (baseStyle = null))
  return baseStyle
}

/**
 * Label text per language. OpenMapTiles carries name:ru and name:en; Tajik
 * names are the local OSM `name` in Tajikistan, so Tajik uses `name` first.
 */
export function labelExpression(lang: Lang): ExpressionSpecification {
  if (lang === 'en') return ['coalesce', ['get', 'name:en'], ['get', 'name:latin'], ['get', 'name']]
  if (lang === 'ru') return ['coalesce', ['get', 'name:ru'], ['get', 'name']]
  return ['coalesce', ['get', 'name'], ['get', 'name:ru']]
}

export function featureName(props: Record<string, unknown>, lang: Lang): string {
  const pick = (...keys: string[]) => keys.map((k) => props[k]).find((v) => typeof v === 'string' && v) as string | undefined
  if (lang === 'en') return pick('name:en', 'name:latin', 'name') ?? ''
  if (lang === 'ru') return pick('name:ru', 'name') ?? ''
  return pick('name', 'name:ru') ?? ''
}

function isNameLabel(layer: LayerSpecification): boolean {
  if (layer.type !== 'symbol') return false
  const field = layer.layout?.['text-field']
  return !!field && JSON.stringify(field).includes('"name')
}

export function buildStyle(
  base: StyleSpecification,
  cfg: MapConfig,
  lang: Lang,
  border: number[][][] | null,
): StyleSpecification {
  const style = structuredClone(base)
  style.projection = { type: 'globe' }
  style.sky = {
    'sky-color': '#86b6e8',
    'horizon-color': '#d9e7f5',
    'fog-color': '#e7eef5',
    'sky-horizon-blend': 0.6,
    'horizon-fog-blend': 0.6,
    'fog-ground-blend': 0.4,
    'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 6, 0.6, 10, 0],
  }

  style.sources.satellite = {
    type: 'raster',
    tiles: cfg.satellite.tiles,
    tileSize: 256,
    maxzoom: cfg.satellite.maxzoom,
    attribution: cfg.satellite.attribution,
  }
  style.sources.dem = { type: 'raster-dem', tiles: [TERRARIUM], encoding: 'terrarium', tileSize: 256, maxzoom: 15, attribution: DEM_ATTRIBUTION }
  // A separate source for hillshading is recommended so it does not compete with terrain.
  style.sources['dem-shade'] = { type: 'raster-dem', tiles: [TERRARIUM], encoding: 'terrarium', tileSize: 256, maxzoom: 13 }
  style.sources.landmarks = { type: 'geojson', data: { type: 'FeatureCollection', features: [] } }
  if (border) {
    style.sources['tj-border'] = {
      type: 'geojson',
      data: { type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: border } },
    }
  }

  const label = labelExpression(lang)
  const layers: LayerSpecification[] = style.layers.map((layer) =>
    isNameLabel(layer) ? ({ ...layer, layout: { ...layer.layout, 'text-field': label } } as LayerSpecification) : layer,
  )
  const font = (layers.find((l) => l.id === 'label_city')?.layout as Record<string, unknown> | undefined)?.['text-font'] ?? ['Noto Sans Regular']

  const insertBefore = (id: string, ...extra: LayerSpecification[]) => {
    const i = layers.findIndex((l) => l.id === id)
    layers.splice(i < 0 ? layers.length : i, 0, ...extra)
  }

  insertBefore('park', { id: 'satellite', type: 'raster', source: 'satellite', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 200 } })
  insertBefore('waterway_tunnel', {
    id: 'hillshade',
    type: 'hillshade',
    source: 'dem-shade',
    paint: {
      'hillshade-exaggeration': 0.35,
      'hillshade-shadow-color': '#473b2e',
      'hillshade-highlight-color': '#fffaf0',
      'hillshade-accent-color': '#5a4a38',
    },
  })

  const firstSymbol = layers.find((l) => l.type === 'symbol')?.id ?? ''
  if (border) {
    insertBefore(
      firstSymbol,
      { id: 'tj-border-glow', type: 'line', source: 'tj-border', paint: { 'line-color': '#d9a441', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 10], 'line-blur': 6, 'line-opacity': 0.45 } },
      { id: 'tj-border', type: 'line', source: 'tj-border', paint: { 'line-color': '#b8862b', 'line-width': ['interpolate', ['linear'], ['zoom'], 3, 1.2, 10, 2.5] } },
    )
  }

  if (cfg.mapillary_token) {
    style.sources.mapillary = {
      type: 'vector',
      tiles: [`https://tiles.mapillary.com/maps/vtp/mly1_public/2/{z}/{x}/{y}?access_token=${cfg.mapillary_token}`],
      minzoom: 6,
      maxzoom: 14,
      attribution: '<a href="https://www.mapillary.com" target="_blank" rel="noopener">Mapillary</a>, CC BY-SA',
    }
    insertBefore(
      firstSymbol,
      { id: 'mly-seq', type: 'line', source: 'mapillary', 'source-layer': 'sequence', layout: { visibility: 'none', 'line-cap': 'round' }, paint: { 'line-color': '#1f8cff', 'line-width': ['interpolate', ['linear'], ['zoom'], 6, 1, 16, 4], 'line-opacity': 0.8 } },
      { id: 'mly-img', type: 'circle', source: 'mapillary', 'source-layer': 'image', minzoom: 15, layout: { visibility: 'none' }, paint: { 'circle-radius': 4, 'circle-color': ['case', ['get', 'is_pano'], '#ffb020', '#1f8cff'], 'circle-stroke-color': '#fff', 'circle-stroke-width': 1 } },
    )
  }

  layers.push(
    {
      id: 'lm-halo',
      type: 'circle',
      source: 'landmarks',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 9, 12, 16], 'circle-color': '#d9a441', 'circle-opacity': 0.25, 'circle-blur': 0.6 },
    },
    {
      id: 'lm-dot',
      type: 'circle',
      source: 'landmarks',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 4, 4.5, 12, 7],
        'circle-color': ['get', 'color'],
        'circle-stroke-color': '#fffaf0',
        'circle-stroke-width': 2,
      },
    },
    {
      id: 'lm-label',
      type: 'symbol',
      source: 'landmarks',
      layout: {
        'text-field': ['get', 'name'],
        'text-font': font as string[],
        'text-size': ['interpolate', ['linear'], ['zoom'], 4, 11, 12, 14],
        'text-offset': [0, 1.1],
        'text-anchor': 'top',
        'text-optional': true,
      },
      paint: { 'text-color': '#3a2a12', 'text-halo-color': '#fffaf0', 'text-halo-width': 1.6 },
    },
  )

  style.layers = layers
  return style
}

/** Ids of the label layers whose text follows the interface language. */
export function nameLabelLayers(map: MlMap): string[] {
  return (map.getStyle().layers ?? []).filter((l) => isNameLabel(l) && !l.id.startsWith('lm-')).map((l) => l.id)
}

export function setLanguage(map: MlMap, lang: Lang) {
  const expr = labelExpression(lang)
  for (const id of nameLabelLayers(map)) map.setLayoutProperty(id, 'text-field', expr)
}

const originalPaint = new WeakMap<MlMap, Map<string, { color: unknown; halo: unknown }>>()
const originalRoads = new WeakMap<MlMap, Map<string, unknown>>()

export function applyBaseLayer(map: MlMap, base: BaseLayer) {
  const satellite = base === 'satellite'
  for (const layer of map.getStyle().layers ?? []) {
    if (HYBRID_HIDDEN.test(layer.id)) map.setLayoutProperty(layer.id, 'visibility', satellite ? 'none' : 'visible')
  }
  map.setLayoutProperty('satellite', 'visibility', satellite ? 'visible' : 'none')
  map.setLayoutProperty('hillshade', 'visibility', satellite ? 'none' : 'visible')
  map.setPaintProperty('hillshade', 'hillshade-exaggeration', base === 'terrain' ? 0.75 : 0.35)
  // Labels stay readable on imagery: white text with a dark halo. The style's own
  // colours are remembered on first use so the map mode can restore them.
  let saved = originalPaint.get(map)
  if (!saved) {
    saved = new Map()
    for (const id of nameLabelLayers(map)) {
      saved.set(id, { color: map.getPaintProperty(id, 'text-color'), halo: map.getPaintProperty(id, 'text-halo-color') })
    }
    originalPaint.set(map, saved)
  }
  for (const [id, paint] of saved) {
    map.setPaintProperty(id, 'text-color', satellite ? '#ffffff' : paint.color)
    map.setPaintProperty(id, 'text-halo-color', satellite ? 'rgba(0,0,0,0.8)' : paint.halo)
  }
  // Roads are drawn lighter over imagery, as on hybrid maps, so the photo stays visible.
  let roads = originalRoads.get(map)
  if (!roads) {
    roads = new Map()
    for (const layer of map.getStyle().layers ?? []) {
      if (layer.type === 'line' && 'source-layer' in layer && layer['source-layer'] === 'transportation') {
        roads.set(layer.id, map.getPaintProperty(layer.id, 'line-opacity') ?? 1)
      }
    }
    originalRoads.set(map, roads)
  }
  for (const [id, opacity] of roads) map.setPaintProperty(id, 'line-opacity', satellite ? 0.45 : opacity)
  if (map.getLayer('building-3d')) map.setPaintProperty('building-3d', 'fill-extrusion-opacity', satellite ? 0.55 : 0.9)
}
