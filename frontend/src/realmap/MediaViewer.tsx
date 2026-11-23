/** Full-screen viewer for nearby photos and 360° panoramas, with attribution. */
import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { MediaItem } from '../api/types'
import { useT } from '../i18n/strings'
import { ChevronLeft, ChevronRight, Close } from '../ui/icons'
import { PanoViewer } from './PanoViewer'

const SOURCE_NAME: Record<MediaItem['source'], string> = {
  commons: 'Wikimedia Commons',
  panoramax: 'Panoramax',
  mapillary: 'Mapillary',
}

export function Attribution({ item }: { item: MediaItem }) {
  const t = useT()
  return (
    <span>
      {item.author && <>© {item.author} · </>}
      {item.license_url ? (
        <a href={item.license_url} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 hover:decoration-white">
          {item.license || 'licence'}
        </a>
      ) : (
        item.license
      )}
      {' · '}
      <a href={item.page} target="_blank" rel="noopener noreferrer" className="underline decoration-white/30 hover:decoration-white">
        {t('source')}: {SOURCE_NAME[item.source]}
      </a>
    </span>
  )
}

export function MediaViewer({ items, index, onIndex, onClose }: { items: MediaItem[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const t = useT()
  const item = items[index]
  const go = (d: number) => onIndex((index + d + items.length) % items.length)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      // Arrow keys rotate a panorama, so they only page through flat photos.
      if (item?.kind === 'photo' && e.key === 'ArrowRight') go(1)
      if (item?.kind === 'photo' && e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!item) return null
  // Portalled to <body> so it covers the site header (the map sits in its own stacking context).
  return createPortal(
    <div role="dialog" aria-modal aria-label={item.title} className="fixed inset-0 z-[70] flex flex-col bg-black text-white">
      <div className="relative min-h-0 flex-1">
        {item.kind === 'pano' ? (
          <PanoViewer key={item.id} src={item.full} label={item.title} />
        ) : (
          <img key={item.id} src={item.full} alt={item.title} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
        )}
        <button type="button" onClick={onClose} aria-label={t('close')} autoFocus className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full bg-black/60 hover:bg-black/80">
          <Close />
        </button>
        {items.length > 1 && (
          <>
            <button type="button" onClick={() => go(-1)} aria-label={t('prev')} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 hover:bg-black/80">
              <ChevronLeft />
            </button>
            <button type="button" onClick={() => go(1)} aria-label={t('next')} className="absolute right-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 hover:bg-black/80">
              <ChevronRight />
            </button>
          </>
        )}
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-t border-white/10 px-5 py-3 text-sm">
        <p className="font-medium">
          {item.kind === 'pano' && <span className="mr-2 rounded bg-amber-400 px-1.5 py-0.5 text-[0.65rem] font-bold text-black">360°</span>}
          {item.title}
          {item.date && <span className="ml-2 text-white/60">{item.date}</span>}
        </p>
        <p className="text-xs text-white/70">
          <Attribution item={item} />
          <span className="ml-3 text-white/50">
            {index + 1} / {items.length}
          </span>
        </p>
      </div>
    </div>,
    document.body,
  )
}
