/** Side panel (bottom sheet on phones) for the selected place: address, actions, panoramas and photos. */
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useNearbyMedia } from '../api/hooks'
import type { MediaItem } from '../api/types'
import { formatCoordinates, formatNumber, useT } from '../i18n/strings'
import { useAppStore } from '../store/useAppStore'
import { Close } from '../ui/icons'
import { reverseGeocode } from './geocode'
import { Attribution } from './MediaViewer'

export interface Selection {
  kind: 'landmark' | 'poi' | 'point'
  lat: number
  lon: number
  name?: string
  detail?: string
  slug?: string
  /** Search radius for photos, metres. */
  radius: number
}

function distance(m: number | null, lang: 'tg' | 'ru' | 'en', t: ReturnType<typeof useT>) {
  if (m === null) return ''
  return m < 1000 ? `${formatNumber(m, lang)} ${t('m')}` : `${formatNumber(m / 1000, lang, 1)} ${t('km')}`
}

export function PlacePanel({
  selection,
  onClose,
  onOpenMedia,
  onZoom,
}: {
  selection: Selection
  onClose: () => void
  onOpenMedia: (items: MediaItem[], index: number) => void
  onZoom: () => void
}) {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  const [copied, setCopied] = useState(false)
  const media = useNearbyMedia({ lat: selection.lat, lon: selection.lon, radius: selection.radius })
  const address = useQuery({
    queryKey: ['reverse', selection.lat.toFixed(5), selection.lon.toFixed(5), lang],
    queryFn: ({ signal }) => reverseGeocode(selection.lat, selection.lon, lang, signal),
    enabled: selection.kind !== 'landmark',
    staleTime: Infinity,
    retry: 1,
  })

  const place = address.data
  const title = selection.name || place?.name || t('whatsHere')
  const subtitle = selection.detail || (place ? [place.name !== title ? place.name : '', place.detail].filter(Boolean).join(', ') : '')
  const coords = `${selection.lat.toFixed(6)}, ${selection.lon.toFixed(6)}`
  const panos = media.data?.panoramas ?? []
  const photos = media.data?.photos ?? []

  const copy = () => {
    navigator.clipboard?.writeText(coords).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }

  return (
    <aside
      aria-label={title}
      className="rise pointer-events-auto fixed inset-x-0 bottom-0 z-30 flex max-h-[58vh] flex-col overflow-hidden rounded-t-3xl bg-white text-neutral-900 shadow-2xl md:inset-x-auto md:bottom-6 md:left-6 md:top-36 md:max-h-none md:w-[400px] md:rounded-3xl"
    >
      <div className="flex items-start gap-3 border-b border-neutral-200 px-5 pb-4 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="font-display text-2xl leading-tight">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-neutral-600">{subtitle}</p>}
          {address.isLoading && !selection.name && <p className="mt-1 h-4 w-40 animate-pulse rounded bg-neutral-200" />}
          <p className="mt-2 text-xs text-neutral-500">{formatCoordinates(selection.lat, selection.lon, lang, t)}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={t('close')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-neutral-600 hover:bg-neutral-100">
          <Close />
        </button>
      </div>

      <div className="flex flex-wrap gap-2 px-5 py-3">
        {selection.slug && (
          <Link to={`/place/${selection.slug}`} className="rounded-full bg-amber-500 px-4 py-2 text-sm font-medium text-white hover:bg-amber-600">
            {t('open3d')}
          </Link>
        )}
        <button type="button" onClick={onZoom} className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100">
          {t('zoomIn')}
        </button>
        <button type="button" onClick={copy} className="rounded-full border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-100">
          {copied ? t('copied') : t('copyCoords')}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
        <h3 className="mb-2 mt-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">{t('panoramas')}</h3>
        {media.isLoading ? (
          <div className="flex gap-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-28 w-48 animate-pulse rounded-xl bg-neutral-200" />
            ))}
          </div>
        ) : panos.length ? (
          <div className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-2">
            {panos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenMedia(panos, i)}
                className="group relative h-28 w-48 shrink-0 snap-start overflow-hidden rounded-xl bg-neutral-200"
                aria-label={`360° · ${p.title}`}
              >
                <img src={p.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
                <span className="absolute left-2 top-2 rounded bg-amber-400 px-1.5 py-0.5 text-[0.65rem] font-bold text-black">360°</span>
                <span className="absolute bottom-1 right-2 text-[0.65rem] text-white drop-shadow">{distance(p.distance_m, lang, t)}</span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">
            {t('noPanoramas')}
            {media.data && !media.data.mapillary_enabled && <span className="mt-1 block text-xs text-neutral-400">{t('mapillaryHint')}</span>}
          </p>
        )}

        <h3 className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wider text-neutral-500">
          {t('photosNearby')}
          {photos.length > 0 && <span className="ml-1 text-neutral-400">· {photos.length}</span>}
        </h3>
        {media.isLoading ? (
          <div className="grid grid-cols-3 gap-1.5">
            {Array.from({ length: 6 }, (_, i) => (
              <div key={i} className="aspect-square animate-pulse rounded-lg bg-neutral-200" />
            ))}
          </div>
        ) : photos.length ? (
          <div className="grid grid-cols-3 gap-1.5">
            {photos.map((p, i) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenMedia(photos, i)}
                title={`${p.title}${p.author ? ` · © ${p.author}` : ''}`}
                className="group relative aspect-square overflow-hidden rounded-lg bg-neutral-200"
              >
                <img src={p.thumb} alt={p.title} loading="lazy" referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform group-hover:scale-105" />
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-neutral-500">{media.isError ? t('error') : t('noPhotos')}</p>
        )}

        {photos[0] && (
          <p className="mt-3 text-[0.68rem] leading-relaxed text-neutral-400 [&_a]:decoration-neutral-300">
            <span className="text-neutral-500">{photos[0].title}:</span> <Attribution item={photos[0]} />
          </p>
        )}
        {media.data && media.data.sources_failed.length > 0 && (
          <p className="mt-3 text-xs text-neutral-400">
            {t('sourcesFailed')}: {media.data.sources_failed.join(', ')}
          </p>
        )}
        <p className="mt-4 text-[0.68rem] text-neutral-400">{coords}</p>
      </div>
    </aside>
  )
}
