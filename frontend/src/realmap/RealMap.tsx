/**
 * The real map of Tajikistan (route /map): every road, building and place from
 * OpenStreetMap, satellite imagery, 3D relief and 3D buildings, search, "what is
 * here", openly licensed photos and 360° panoramas around any point, and the
 * platform's landmarks with a way into their 3D stage.
 *
 * The camera position lives in the URL hash (#zoom/lat/lon/bearing/pitch), so any
 * view can be shared or bookmarked.
 */
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCategories, useLandmarks, useMapConfig } from '../api/hooks'
import type { MediaItem } from '../api/types'
import { useT, type StringKey } from '../i18n/strings'
import { loadJSON } from '../lib/geo'
import { useAppStore } from '../store/useAppStore'
import { zoomFor } from './geocode'
import { MapSearch, type SearchPick } from './MapSearch'
import { MediaViewer } from './MediaViewer'
import { PlacePanel, type Selection } from './PlacePanel'
import {
  applyBaseLayer,
  buildStyle,
  featureName,
  LANDMARK_LAYERS,
  loadBaseStyle,
  MAPILLARY_LAYERS,
  POI_LAYERS,
  setLanguage,
  TJ_CENTER,
  type BaseLayer,
} from './style'

const PREFS_KEY = 'tj3d.realmap'
interface Prefs {
  base: BaseLayer
  terrain: boolean
  buildings: boolean
  landmarks: boolean
  street: boolean
}
const DEFAULT_PREFS: Prefs = { base: 'satellite', terrain: true, buildings: true, landmarks: true, street: false }

function readPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...(JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Partial<Prefs>) }
  } catch {
    return DEFAULT_PREFS
  }
}

const BASES: { id: BaseLayer; key: StringKey; swatch: string }[] = [
  { id: 'map', key: 'layerMap', swatch: 'linear-gradient(135deg,#f3efe6 0 45%,#cfe3c4 45% 60%,#fff 60% 64%,#a9cbe8 64%)' },
  { id: 'satellite', key: 'layerSatellite', swatch: 'linear-gradient(135deg,#3d4a2c 0 35%,#6b6a4f 35% 55%,#a59a7a 55% 70%,#2f4a5c 70%)' },
  { id: 'terrain', key: 'layerTerrain', swatch: 'linear-gradient(135deg,#e9e2d0 0 30%,#b9ab8f 30% 50%,#857660 50% 65%,#f8f8f8 65%)' },
]

function radiusForZoom(zoom: number): number {
  if (zoom >= 16) return 250
  if (zoom >= 14) return 600
  if (zoom >= 11) return 2000
  return 6000
}

export default function RealMap() {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  const container = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const marker = useRef<maplibregl.Marker | null>(null)
  const [ready, setReady] = useState(false)
  const [failed, setFailed] = useState(false)
  const [prefs, setPrefs] = useState<Prefs>(readPrefs)
  const [layersOpen, setLayersOpen] = useState(false)
  const [zoom, setZoom] = useState(0)
  const [selection, setSelection] = useState<Selection | null>(null)
  const [viewer, setViewer] = useState<{ items: MediaItem[]; index: number } | null>(null)
  const { data: cfg, isError: cfgError } = useMapConfig()
  const { data: landmarks } = useLandmarks()
  const { data: categories } = useCategories()
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs
  const langRef = useRef(lang)
  langRef.current = lang
  const landmarksRef = useRef(landmarks)
  landmarksRef.current = landmarks

  const update = (patch: Partial<Prefs>) =>
    setPrefs((p) => {
      const next = { ...p, ...patch }
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(next))
      } catch {
        /* storage unavailable */
      }
      return next
    })

  useEffect(() => {
    document.title = `${t('realMap')} · ${t('brand')}`
  }, [t])

  // Create the map once the runtime config is known.
  useEffect(() => {
    if (!cfg || !container.current || mapRef.current) return
    let cancelled = false
    Promise.all([loadBaseStyle(), loadJSON<number[][][]>('/terrain/border.json').catch(() => null)])
      .then(([base, border]) => {
        if (cancelled || !container.current) return
        const shared = /^#\d/.test(window.location.hash)
        const map = new maplibregl.Map({
          container: container.current,
          style: buildStyle(base, cfg, langRef.current, border),
          center: TJ_CENTER,
          zoom: shared ? 6 : 1.6,
          hash: true,
          maxPitch: 80,
          attributionControl: { compact: true },
          canvasContextAttributes: { antialias: true },
        })
        mapRef.current = map
        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right')
        map.addControl(new maplibregl.GeolocateControl({ positionOptions: { enableHighAccuracy: true }, trackUserLocation: true }), 'bottom-right')
        map.addControl(new maplibregl.FullscreenControl(), 'bottom-right')
        map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
        map.on('zoomend', () => setZoom(map.getZoom()))
        map.on('error', (e) => console.warn('[map]', e.error?.message ?? e))
        map.once('load', () => {
          setReady(true)
          setZoom(map.getZoom())
          if (!shared) map.flyTo({ center: TJ_CENTER, zoom: 6.3, pitch: 0, duration: 4500, essential: true })
        })
        ;(window as unknown as { __TJ3D_MAP__?: maplibregl.Map }).__TJ3D_MAP__ = map
      })
      .catch(() => !cancelled && setFailed(true))
    return () => {
      cancelled = true
    }
  }, [cfg])

  useEffect(
    () => () => {
      mapRef.current?.remove()
      mapRef.current = null
    },
    [],
  )

  // Layers follow the preferences.
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    applyBaseLayer(map, prefs.base)
    const vis = (id: string, on: boolean) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none')
    vis('building-3d', prefs.buildings)
    for (const id of ['lm-halo', ...LANDMARK_LAYERS]) vis(id, prefs.landmarks)
    for (const id of MAPILLARY_LAYERS) vis(id, prefs.street)
  }, [ready, prefs.base, prefs.buildings, prefs.landmarks, prefs.street])

  // 3D relief (and the "terrain" base layer always shows it).
  const terrainOn = prefs.terrain || prefs.base === 'terrain'
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    if (terrainOn) {
      map.setTerrain({ source: 'dem', exaggeration: 1.5 })
      if (map.getPitch() < 20 && map.getZoom() > 7) map.easeTo({ pitch: 55, duration: 1200 })
    } else {
      map.setTerrain(null)
    }
  }, [ready, terrainOn])

  useEffect(() => {
    if (ready && mapRef.current) setLanguage(mapRef.current, lang)
  }, [ready, lang])

  // Landmarks of the platform.
  const colors = useMemo(() => Object.fromEntries((categories ?? []).map((c) => [c.slug, c.color])), [categories])
  useEffect(() => {
    const source = mapRef.current?.getSource<GeoJSONSource>('landmarks')
    if (!ready || !source || !landmarks) return
    source.setData({
      type: 'FeatureCollection',
      features: landmarks.map((l) => ({
        type: 'Feature',
        properties: { slug: l.slug, name: l.name, subtitle: l.subtitle, color: colors[l.category] ?? '#d9a441' },
        geometry: { type: 'Point', coordinates: [l.longitude, l.latitude] },
      })),
    })
  }, [ready, landmarks, colors])

  // Clicks: landmark → POI / label → street imagery → any point ("what is here").
  useEffect(() => {
    const map = mapRef.current
    if (!ready || !map) return
    const existing = (ids: string[]) => ids.filter((id) => map.getLayer(id) && map.getLayoutProperty(id, 'visibility') !== 'none')
    const hit = (point: maplibregl.PointLike | [maplibregl.PointLike, maplibregl.PointLike], ids: string[]) => {
      const layers = existing(ids)
      return layers.length ? map.queryRenderedFeatures(point, { layers }) : []
    }
    const pointOf = (f: MapGeoJSONFeature, fallback: maplibregl.LngLat) =>
      f.geometry.type === 'Point' ? { lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] } : { lon: fallback.lng, lat: fallback.lat }

    const onClick = (e: maplibregl.MapMouseEvent) => {
      const box: [maplibregl.PointLike, maplibregl.PointLike] = [
        [e.point.x - 6, e.point.y - 6],
        [e.point.x + 6, e.point.y + 6],
      ]
      const lm = hit(box, LANDMARK_LAYERS)[0]
      if (lm) {
        const item = landmarksRef.current?.find((l) => l.slug === lm.properties.slug)
        if (item) {
          setSelection({ kind: 'landmark', lat: item.latitude, lon: item.longitude, name: item.name, detail: item.subtitle, slug: item.slug, radius: 3000 })
          return
        }
      }
      const poi = hit(box, POI_LAYERS).find((f) => featureName(f.properties, langRef.current))
      if (poi) {
        const p = pointOf(poi, e.lngLat)
        const kind = String(poi.properties.subclass ?? poi.properties.class ?? '')
        const big = poi.layer.id.startsWith('label_city') || poi.layer.id === 'label_town'
        setSelection({ kind: 'poi', ...p, name: featureName(poi.properties, langRef.current), detail: kind.replace(/_/g, ' '), radius: big ? 3000 : 400 })
        return
      }
      const street = hit(box, MAPILLARY_LAYERS)[0]
      setSelection({ kind: 'point', lat: e.lngLat.lat, lon: e.lngLat.lng, radius: street ? 80 : radiusForZoom(map.getZoom()) })
    }
    const onMove = (e: maplibregl.MapMouseEvent) => {
      const any = hit(e.point, [...LANDMARK_LAYERS, ...POI_LAYERS, ...MAPILLARY_LAYERS]).length > 0
      map.getCanvas().style.cursor = any ? 'pointer' : ''
    }
    map.on('click', onClick)
    map.on('mousemove', onMove)
    return () => {
      map.off('click', onClick)
      map.off('mousemove', onMove)
    }
  }, [ready])

  // Marker on the selected point.
  useEffect(() => {
    const map = mapRef.current
    marker.current?.remove()
    marker.current = null
    if (!map || !selection) return
    marker.current = new maplibregl.Marker({ color: '#d9a441' }).setLngLat([selection.lon, selection.lat]).addTo(map)
  }, [selection])

  const flyToSelection = () => {
    const map = mapRef.current
    if (!map || !selection) return
    const target = selection.kind === 'landmark' ? 14 : Math.max(map.getZoom() + 2, 16)
    map.flyTo({ center: [selection.lon, selection.lat], zoom: Math.min(target, 18), pitch: terrainOn ? 60 : 0, duration: 2500, essential: true })
  }

  const onPick = (pick: SearchPick) => {
    const map = mapRef.current
    if (!map) return
    if (pick.type === 'landmark') {
      const l = pick.landmark
      setSelection({ kind: 'landmark', lat: l.latitude, lon: l.longitude, name: l.name, detail: l.subtitle, slug: l.slug, radius: 3000 })
      map.flyTo({ center: [l.longitude, l.latitude], zoom: 13.5, pitch: terrainOn ? 60 : 0, duration: 3000, essential: true })
      return
    }
    const p = pick.place
    const z = zoomFor(p.kind)
    setSelection({ kind: 'poi', lat: p.lat, lon: p.lon, name: p.name, detail: p.detail, radius: z <= 12 ? 3000 : z <= 14 ? 1200 : 300 })
    if (p.bbox && z < 16) map.fitBounds(p.bbox, { padding: 80, duration: 2500, maxZoom: 16, pitch: terrainOn ? 50 : 0 })
    else map.flyTo({ center: [p.lon, p.lat], zoom: z, pitch: terrainOn ? 60 : 0, duration: 2500, essential: true })
  }

  const lowRes = cfg && !cfg.satellite.high_resolution && prefs.base === 'satellite' && zoom >= 13

  return (
    <div className="fixed inset-0 z-10 bg-[#d9e7f5]" id="content">
      <div ref={container} className="h-full w-full" data-testid="real-map" data-ready={ready ? '1' : '0'} />

      {/* Keeps the site header (light text) readable over the map. */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5] h-28 bg-gradient-to-b from-ink-950/85 via-ink-950/50 to-transparent" aria-hidden />

      {(failed || cfgError) && (
        <div role="alert" className="absolute inset-0 grid place-items-center p-6 text-center text-neutral-700">
          {t('mapFailed')}
        </div>
      )}

      {landmarks && <MapSearch landmarks={landmarks} onPick={onPick} />}

      {/* Layer switcher, Google-style tile with an expanding panel. */}
      <div className="pointer-events-auto absolute bottom-10 left-4 z-20 flex items-end gap-2 md:left-6">
        <button
          type="button"
          onClick={() => setLayersOpen((o) => !o)}
          aria-expanded={layersOpen}
          aria-label={t('layers')}
          className="relative h-16 w-16 overflow-hidden rounded-xl border-2 border-white shadow-lg"
          style={{ background: BASES.find((b) => b.id !== prefs.base)!.swatch }}
        >
          <span className="absolute inset-x-0 bottom-0 bg-black/45 py-0.5 text-center text-[0.65rem] font-medium text-white">{t('layers')}</span>
        </button>
        {layersOpen && (
          <div className="rise rounded-2xl bg-white p-3 text-neutral-900 shadow-xl" role="group" aria-label={t('layers')}>
            <div className="flex gap-2">
              {BASES.map((b) => (
                <button key={b.id} type="button" onClick={() => update({ base: b.id })} aria-pressed={prefs.base === b.id} className="flex flex-col items-center gap-1 text-xs">
                  <span className={`block h-12 w-12 rounded-lg ${prefs.base === b.id ? 'ring-2 ring-amber-500 ring-offset-2' : 'ring-1 ring-black/10'}`} style={{ background: b.swatch }} />
                  <span className={prefs.base === b.id ? 'font-semibold text-amber-700' : ''}>{t(b.key)}</span>
                </button>
              ))}
            </div>
            <div className="mt-3 grid gap-1 border-t border-neutral-200 pt-2 text-sm">
              {(
                [
                  ['terrain', 'view3d'],
                  ['buildings', 'buildings3d'],
                  ['landmarks', 'landmarksLayer'],
                  ...(cfg?.mapillary_enabled ? [['street', 'streetView']] : []),
                ] as [keyof Prefs, StringKey][]
              ).map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between gap-6 rounded-lg px-2 py-1.5 hover:bg-neutral-100">
                  {t(label)}
                  <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={!!prefs[key]} onChange={(e) => update({ [key]: e.target.checked })} />
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {lowRes && (
        <p className="pointer-events-none absolute bottom-10 left-1/2 z-20 hidden max-w-md -translate-x-1/2 rounded-full bg-black/60 px-4 py-1.5 text-center text-xs text-white md:block">
          {t('satelliteLowRes')}
        </p>
      )}

      {selection && (
        <PlacePanel
          key={`${selection.lat},${selection.lon}`}
          selection={selection}
          onClose={() => setSelection(null)}
          onOpenMedia={(items, index) => setViewer({ items, index })}
          onZoom={flyToSelection}
        />
      )}
      {viewer && <MediaViewer items={viewer.items} index={viewer.index} onIndex={(index) => setViewer({ ...viewer, index })} onClose={() => setViewer(null)} />}
    </div>
  )
}
