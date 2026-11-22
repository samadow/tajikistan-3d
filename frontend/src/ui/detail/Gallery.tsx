import { useEffect, useRef, useState } from 'react'
import type { LandmarkImage } from '../../api/types'
import { useT } from '../../i18n/strings'
import { ChevronLeft, ChevronRight, Close } from '../icons'
import { Section } from './Text'

/** Thumbnail grid (WebP thumbnails) + accessible lightbox with keyboard navigation. */
export function Gallery({ images }: { images: LandmarkImage[] }) {
  const t = useT()
  const [open, setOpen] = useState<number | null>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const current = open !== null ? images[open] : null

  useEffect(() => {
    if (open === null) return
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      e.stopPropagation()
      if (e.key === 'Escape') setOpen(null)
      if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : (i + 1) % images.length))
      if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : (i - 1 + images.length) % images.length))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, images.length])

  return (
    <Section title={t('gallery')}>
      <div className="grid grid-cols-2 gap-2">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpen(i)}
            className={`group overflow-hidden rounded-xl ${i === 0 ? 'col-span-2 aspect-[16/9]' : 'aspect-square'}`}
          >
            <img src={img.thumbnail} alt={img.caption} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          </button>
        ))}
      </div>
      {current && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/95 p-4" role="dialog" aria-modal aria-label={current.caption || t('gallery')} onClick={() => setOpen(null)}>
          <figure className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img src={current.image} alt={current.caption} className="max-h-[80vh] rounded-xl object-contain" />
            <figcaption className="mt-3 flex justify-between gap-4 text-sm text-mist">
              <span>{current.caption}</span>
              {(current.credit || current.license) && <span>© {[current.credit, current.license].filter(Boolean).join(' · ')}</span>}
            </figcaption>
          </figure>
          {images.length > 1 && (
            <>
              <button type="button" className="icon-btn glass absolute left-4 top-1/2" onClick={(e) => (e.stopPropagation(), setOpen((open! - 1 + images.length) % images.length))} aria-label={t('prev')}>
                <ChevronLeft />
              </button>
              <button type="button" className="icon-btn glass absolute right-4 top-1/2" onClick={(e) => (e.stopPropagation(), setOpen((open! + 1) % images.length))} aria-label={t('next')}>
                <ChevronRight />
              </button>
            </>
          )}
          <button ref={closeRef} type="button" className="icon-btn absolute right-6 top-6" onClick={() => setOpen(null)} aria-label={t('close')}>
            <Close />
          </button>
        </div>
      )}
    </Section>
  )
}
