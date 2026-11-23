import type { StyleSpecification } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import type { MapConfig } from '../api/types'
import { zoomFor } from './geocode'
import { buildStyle, featureName, labelExpression } from './style'

const base = {
  version: 8,
  sources: { openmaptiles: { type: 'vector', url: 'https://example/planet' } },
  layers: [
    { id: 'background', type: 'background' },
    { id: 'park', type: 'fill', source: 'openmaptiles', 'source-layer': 'park' },
    { id: 'waterway_tunnel', type: 'line', source: 'openmaptiles', 'source-layer': 'waterway' },
    { id: 'label_city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', layout: { 'text-field': ['get', 'name:latin'], 'text-font': ['Noto Sans Regular'] } },
    { id: 'shield', type: 'symbol', source: 'openmaptiles', 'source-layer': 'transportation_name', layout: { 'text-field': ['get', 'ref'] } },
  ],
} as unknown as StyleSpecification

const cfg: MapConfig = {
  satellite: { tiles: ['https://sat/{z}/{y}/{x}.jpg'], maxzoom: 15, attribution: 'sat', high_resolution: false },
  mapillary_enabled: false,
  mapillary_token: '',
}

describe('real map style', () => {
  it('adds satellite under the map fills, relief, border and landmark layers', () => {
    const style = buildStyle(base, cfg, 'ru', [[[68, 38], [69, 39]]])
    const ids = style.layers.map((l) => l.id)
    expect(ids.indexOf('satellite')).toBe(ids.indexOf('park') - 1)
    expect(ids.indexOf('hillshade')).toBeLessThan(ids.indexOf('waterway_tunnel'))
    expect(ids.indexOf('tj-border')).toBeLessThan(ids.indexOf('label_city'))
    expect(ids.slice(-3)).toEqual(['lm-halo', 'lm-dot', 'lm-label'])
    expect(style.projection).toEqual({ type: 'globe' })
    expect(style.sources.mapillary).toBeUndefined()
    // The base style is not mutated.
    expect(base.layers).toHaveLength(5)
  })

  it('localises name labels but leaves road shields alone', () => {
    const style = buildStyle(base, cfg, 'en', null)
    const city = style.layers.find((l) => l.id === 'label_city')!
    const shield = style.layers.find((l) => l.id === 'shield')!
    expect((city.layout as Record<string, unknown>)['text-field']).toEqual(labelExpression('en'))
    expect((shield.layout as Record<string, unknown>)['text-field']).toEqual(['get', 'ref'])
  })

  it('adds the Mapillary coverage layers only with a token', () => {
    const style = buildStyle(base, { ...cfg, mapillary_enabled: true, mapillary_token: 'MLY|1' }, 'tg', null)
    expect(style.layers.map((l) => l.id)).toContain('mly-seq')
    expect(JSON.stringify(style.sources.mapillary)).toContain('access_token=MLY|1')
  })

  it('picks feature names per language with fallbacks', () => {
    const props = { name: 'Душанбе', 'name:en': 'Dushanbe', 'name:ru': 'Душанбе' }
    expect(featureName(props, 'en')).toBe('Dushanbe')
    expect(featureName({ name: 'Хоруғ' }, 'ru')).toBe('Хоруғ')
    expect(featureName({ 'name:ru': 'Хорог' }, 'tg')).toBe('Хорог')
  })

  it('frames places by kind', () => {
    expect(zoomFor('city')).toBeLessThan(zoomFor('village'))
    expect(zoomFor('house')).toBeGreaterThan(zoomFor('street'))
  })
})
