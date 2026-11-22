import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLandmark, useLandmarks } from '../api/hooks'
import type { LandmarkDetail, LandmarkImage } from '../api/types'
import { formatYear, useT } from '../i18n/strings'
import { useAppStore } from '../store/useAppStore'

/** Everything shown around the 3D model on /place/:slug. Also used by the 2D fallback. */
export function DetailView({ slug, webgl }: { slug: string; webgl: boolean }) {
  const { data, isError, refetch } = useLandmark(slug)
  const mode = useAppStore((s) => s.mode)
  const t = useT()
  // In 3D the panel waits for the camera to land; in 2D it shows immediately.
  const visible = !webgl || mode === 'detail'

  if (isError)
    return (
      <div className="fixed inset-0 z-30 grid place-items-center">
        <div className="glass rounded-2xl p-8 text-center">
          <p>{t('error')}</p>
          <button type="button" className="btn-ghost mt-4" onClick={() => refetch()}>
            {t('retry')}
          </button>
        </div>
      </div>
    )
  if (!data || data.slug !== slug) return null

  return (
    <div className={`transition-opacity duration-700 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <TopBar landmark={data} />
      <Panel landmark={data} webgl={webgl} />
      {webgl && data.eras.length > 1 && <TimeSlider landmark={data} />}
      {webgl && data.hotspots.length > 0 && <HotspotHint count={data.hotspots.length} />}
    </div>
  )
}

function TopBar({ landmark }: { landmark: LandmarkDetail }) {
  const t = useT()
  const navigate = useNavigate()
  const { data: all } = useLandmarks()
  const index = all?.findIndex((l) => l.slug === landmark.slug) ?? -1
  const go = (delta: number) => {
    if (!all || index < 0) return
    navigate(`/place/${all[(index + delta + all.length) % all.length].slug}`)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'Escape') navigate('/')
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-30 flex items-center justify-between px-4 md:top-24 md:px-8 lg:right-[min(36rem,42vw)]">
      <Link to="/" className="btn-ghost glass pointer-events-auto">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M19 12H5M11 6l-6 6 6 6" />
        </svg>
        {t('back')}
      </Link>
      {all && index >= 0 && (
        <div className="pointer-events-auto flex items-center gap-2">
          <button type="button" className="icon-btn glass" onClick={() => go(-1)} aria-label={t('prev')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 6l-6 6 6 6" />
            </svg>
          </button>
          <span className="w-14 text-center text-xs tabular-nums tracking-widest text-mist">
            {String(index + 1).padStart(2, '0')} / {String(all.length).padStart(2, '0')}
          </span>
          <button type="button" className="icon-btn glass" onClick={() => go(1)} aria-label={t('next')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}

function Paragraphs({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className="mb-4 leading-relaxed text-parchment/85 last:mb-0">
            {p}
          </p>
        ))}
    </>
  )
}

function Soon() {
  const t = useT()
  return <p className="italic text-mist/70">{t('textSoon')}</p>
}

function Panel({ landmark, webgl }: { landmark: LandmarkDetail; webgl: boolean }) {
  const t = useT()
  const m = t('m')
  const coords = `${landmark.latitude.toFixed(3)}° N, ${landmark.longitude.toFixed(3)}° E`
  return (
    <aside
      key={landmark.slug}
      className={`glass scrollbar-thin fixed z-20 overflow-y-auto ${
        webgl
          ? 'inset-x-0 bottom-0 max-h-[46vh] rounded-t-3xl lg:inset-y-4 lg:left-auto lg:right-4 lg:max-h-none lg:w-[min(34rem,40vw)] lg:rounded-3xl'
          : 'inset-x-0 bottom-0 top-20 rounded-t-3xl md:left-auto md:right-4 md:top-24 md:bottom-4 md:w-[34rem] md:rounded-3xl'
      }`}
    >
      {landmark.poster ? (
        <div className="relative h-56 overflow-hidden lg:h-72">
          <img src={landmark.poster} alt="" className="h-full w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-900 via-ink-900/30 to-transparent" />
        </div>
      ) : (
        <div className="h-6 lg:h-10" />
      )}
      <div className="rise px-6 pb-10 md:px-10">
        <div className="flex items-center gap-3">
          <span className="h-2 w-2 rounded-full" style={{ background: landmark.category.color }} />
          <span className="kicker">{landmark.category.name}</span>
        </div>
        <h1 className="mt-3 font-display text-5xl font-medium leading-[0.95] text-balance md:text-6xl">{landmark.name}</h1>
        {landmark.subtitle && <p className="mt-3 font-display text-xl italic text-gold-300/90">{landmark.subtitle}</p>}
        <div className="ornament-band my-6 w-full" />

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <div>
            <dt className="kicker !text-[0.6rem] !text-mist">{t('elevation')}</dt>
            <dd className="mt-1 font-display text-2xl">
              {landmark.elevation_m.toLocaleString('ru-RU')} <span className="text-base text-mist">{m}</span>
            </dd>
          </div>
          <div>
            <dt className="kicker !text-[0.6rem] !text-mist">{t('coordinates')}</dt>
            <dd className="mt-1 text-sm tabular-nums">{coords}</dd>
          </div>
          <div className="col-span-2">
            <dt className="kicker !text-[0.6rem] !text-mist">{t('bestSeason')}</dt>
            <dd className="mt-1">{landmark.best_season || <span className="italic text-mist/70">—</span>}</dd>
          </div>
        </dl>

        {landmark.short_description && <p className="mt-8 text-lg leading-relaxed text-parchment">{landmark.short_description}</p>}

        <section className="mt-8">
          <h2 className="kicker mb-3">{t('story')}</h2>
          {landmark.full_description ? <Paragraphs text={landmark.full_description} /> : <Soon />}
        </section>

        {landmark.images.length > 0 && <Gallery images={landmark.images} />}

        <section className="mt-8">
          <h2 className="kicker mb-3">{t('howToGet')}</h2>
          {landmark.how_to_get_there ? <Paragraphs text={landmark.how_to_get_there} /> : <Soon />}
        </section>

        <footer className="mt-10 space-y-1 border-t hairline pt-4 text-[0.7rem] text-mist/70">
          {webgl && !landmark.models.length && <p>{t('placeholderModel')}</p>}
          {landmark.models[0]?.credit && (
            <p>
              {t('modelCredit')}: {landmark.models[0].credit}
            </p>
          )}
          {landmark.poster_credit && <p>© {landmark.poster_credit}</p>}
        </footer>
      </div>
    </aside>
  )
}

function Gallery({ images }: { images: LandmarkImage[] }) {
  const t = useT()
  const [open, setOpen] = useState<number | null>(null)
  const current = open !== null ? images[open] : null
  return (
    <section className="mt-8">
      <h2 className="kicker mb-3">{t('gallery')}</h2>
      <div className="grid grid-cols-2 gap-2">
        {images.map((img, i) => (
          <button
            key={img.id}
            type="button"
            onClick={() => setOpen(i)}
            className={`group overflow-hidden rounded-xl ${i === 0 ? 'col-span-2 aspect-[16/9]' : 'aspect-square'}`}
          >
            <img src={img.image} alt={img.caption} loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
          </button>
        ))}
      </div>
      {current && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/95 p-4" role="dialog" aria-modal onClick={() => setOpen(null)}>
          <figure className="max-h-full max-w-5xl" onClick={(e) => e.stopPropagation()}>
            <img src={current.image} alt={current.caption} className="max-h-[80vh] rounded-xl object-contain" />
            <figcaption className="mt-3 flex justify-between gap-4 text-sm text-mist">
              <span>{current.caption}</span>
              {current.credit && <span>© {current.credit}</span>}
            </figcaption>
          </figure>
          <button type="button" className="icon-btn absolute right-6 top-6" onClick={() => setOpen(null)} aria-label={t('close')}>
            ✕
          </button>
        </div>
      )}
    </section>
  )
}

function TimeSlider({ landmark }: { landmark: LandmarkDetail }) {
  const t = useT()
  const eraIndex = useAppStore((s) => s.eraIndex)
  const setEraIndex = useAppStore((s) => s.setEraIndex)
  const eras = landmark.eras
  const era = eras[eraIndex] ?? eras[0]
  return (
    <div className="glass fixed bottom-[calc(46vh+0.5rem)] left-1/2 z-30 w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 rounded-2xl px-5 py-3 lg:px-6 lg:py-4 lg:bottom-8 lg:left-[calc((100vw-min(34rem,40vw))/2)]">
      <div className="mb-2 flex items-baseline justify-between lg:mb-3">
        <span className="kicker">{t('timeline')}</span>
        <span className="font-display text-2xl text-gold-300">{formatYear(era.year, t)}</span>
      </div>
      <input
        type="range"
        className="era-range"
        min={0}
        max={eras.length - 1}
        step={1}
        value={eraIndex}
        onChange={(e) => setEraIndex(Number(e.target.value))}
        aria-label={t('timeline')}
        aria-valuetext={`${era.label} — ${formatYear(era.year, t)}`}
      />
      <div className="mt-3 flex justify-between gap-2 text-xs">
        {eras.map((e, i) => (
          <button key={e.id} type="button" onClick={() => setEraIndex(i)} className={`transition-colors ${i === eraIndex ? 'text-parchment' : 'text-mist/60 hover:text-mist'}`}>
            {e.label}
          </button>
        ))}
      </div>
      {era.description && <p className="mt-3 text-xs leading-relaxed text-mist">{era.description}</p>}
    </div>
  )
}

function HotspotHint({ count }: { count: number }) {
  const t = useT()
  return (
    <div className="pointer-events-none fixed left-4 top-36 z-20 hidden items-center gap-2 text-xs text-mist md:left-8 md:top-40 lg:flex">
      <span className="grid h-5 w-5 place-items-center rounded-full bg-gold-400 text-[0.6rem] font-semibold text-ink-900">{count}</span>
      {t('hotspots')}
    </div>
  )
}
