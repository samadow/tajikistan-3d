import { Link, useNavigate } from 'react-router-dom'
import { useCategories, useLandmarks } from '../api/hooks'
import { useT } from '../i18n/strings'
import { useAppStore } from '../store/useAppStore'
import { ArrowRight } from './icons'

/** UI layered over the 3D map: hero copy, landmark index and category filter. */
export function MapOverlay() {
  const t = useT()
  const mode = useAppStore((s) => s.mode)
  const visible = mode === 'map'
  return (
    <main id="content" className={`pointer-events-none fixed inset-0 z-20 transition-opacity duration-700 ${visible ? 'opacity-100' : 'opacity-0'}`} aria-hidden={!visible}>
      {/* Soft shading behind the text so it stays readable over bright terrain. */}
      <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-ink-900/80 via-ink-900/25 to-transparent md:w-[55vw]" />
      <div className="absolute inset-y-0 right-0 hidden w-80 bg-gradient-to-l from-ink-900/70 to-transparent lg:block" />
      <div className="absolute inset-x-0 bottom-0 h-48 bg-gradient-to-t from-ink-900/80 to-transparent" />
      <Hero />
      <LandmarkRail />
      <CategoryFilter />
      <p className="pointer-events-none absolute bottom-2 left-4 hidden text-[0.6rem] tracking-wide text-mist/50 md:block">{t('footer')}</p>
    </main>
  )
}

function Hero() {
  const t = useT()
  // On phones the hero shrinks once the user starts exploring, freeing the map (audit D7).
  const interacted = useAppStore((s) => s.interacted)
  return (
    <section className={`absolute left-4 top-24 max-w-md transition-all duration-700 md:left-8 md:top-32 md:max-w-lg ${interacted ? 'max-md:top-20' : ''}`}>
      <p className={`kicker rise ${interacted ? 'max-md:hidden' : ''}`}>{t('heroKicker')}</p>
      <h1
        className={`rise mt-4 whitespace-pre-line font-display font-medium leading-[0.95] text-balance transition-all duration-700 md:text-7xl lg:text-8xl ${interacted ? 'text-3xl max-md:mt-0' : 'text-5xl'}`}
        style={{ animationDelay: '0.1s' }}
      >
        {t('heroTitle')}
      </h1>
      <div className={`ornament-band rise mt-6 w-40 ${interacted ? 'max-md:hidden' : ''}`} style={{ animationDelay: '0.2s' }} />
      <p className="rise mt-5 hidden max-w-sm text-sm leading-relaxed text-mist sm:block md:text-base" style={{ animationDelay: '0.3s' }}>
        {t('heroText')}
      </p>
      <div className={`rise pointer-events-auto mt-7 flex flex-wrap gap-3 ${interacted ? 'max-md:mt-3' : ''}`} style={{ animationDelay: '0.4s' }}>
        <Link to="/story" className="btn-gold">
          {t('startJourney')}
          <ArrowRight />
        </Link>
      </div>
    </section>
  )
}

function LandmarkRail() {
  const t = useT()
  const navigate = useNavigate()
  const { data: landmarks } = useLandmarks()
  const category = useAppStore((s) => s.category)
  const hovered = useAppStore((s) => s.hoveredSlug)
  const hover = useAppStore((s) => s.hover)
  if (!landmarks) return null
  const list = landmarks.map((lm, i) => ({ lm, i })).filter(({ lm }) => !category || lm.category === category)

  return (
    <>
      {/* Desktop: numbered index on the right (also the keyboard route to every landmark). */}
      <nav aria-label={t('explore')} className="pointer-events-auto absolute right-6 top-1/2 hidden w-64 -translate-y-1/2 lg:block">
        <p className="kicker mb-3 pl-3">
          {list.length} {t('places')}
        </p>
        <ol className="scrollbar-thin max-h-[60vh] space-y-0.5 overflow-y-auto pr-1">
          {list.map(({ lm, i }) => (
            <li key={lm.slug}>
              <button
                type="button"
                onMouseEnter={() => hover(lm.slug)}
                onMouseLeave={() => hover(null)}
                onFocus={() => hover(lm.slug)}
                onBlur={() => hover(null)}
                onClick={() => navigate(`/place/${lm.slug}`)}
                className={`group flex w-full items-baseline gap-3 rounded-lg px-3 py-2 text-left transition-colors ${hovered === lm.slug ? 'bg-gold-500/10' : 'hover:bg-gold-500/5'}`}
              >
                <span className="w-5 text-[0.65rem] tabular-nums text-gold-500">{String(i + 1).padStart(2, '0')}</span>
                <span className={`font-display text-lg leading-tight transition-colors ${hovered === lm.slug ? 'text-gold-300' : 'text-parchment/85'}`}>{lm.name}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      {/* Mobile / tablet: horizontal cards above the filter. */}
      <nav aria-label={t('explore')} className="pointer-events-auto absolute inset-x-0 bottom-20 lg:hidden">
        <ol className="scrollbar-thin flex snap-x gap-3 overflow-x-auto px-4 pb-2">
          {list.map(({ lm, i }) => (
            <li key={lm.slug} className="snap-start">
              <button type="button" onClick={() => navigate(`/place/${lm.slug}`)} className="glass flex w-48 flex-col rounded-xl px-4 py-3 text-left">
                <span className="text-[0.6rem] tracking-[0.3em] text-gold-400">{String(i + 1).padStart(2, '0')}</span>
                <span className="mt-1 font-display text-lg leading-tight">{lm.name}</span>
                <span className="mt-0.5 line-clamp-1 text-[0.7rem] text-mist">{lm.subtitle}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
    </>
  )
}

function CategoryFilter() {
  const t = useT()
  const { data: categories } = useCategories()
  const category = useAppStore((s) => s.category)
  const setCategory = useAppStore((s) => s.setCategory)
  if (!categories) return null
  const chip = (active: boolean) =>
    `flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-[0.7rem] uppercase tracking-[0.18em] transition-all ${active ? 'bg-gold-400 text-ink-900' : 'text-mist hover:text-parchment'}`

  return (
    <div className="pointer-events-auto absolute inset-x-0 bottom-4 flex justify-center px-4 md:bottom-8">
      <div className="glass scrollbar-thin flex max-w-full gap-1 overflow-x-auto rounded-full p-1.5" role="group" aria-label={t('all')}>
        <button type="button" className={chip(!category)} onClick={() => setCategory(null)} aria-pressed={!category}>
          {t('all')}
        </button>
        {categories.map((c) => (
          <button key={c.slug} type="button" className={chip(category === c.slug)} onClick={() => setCategory(category === c.slug ? null : c.slug)} aria-pressed={category === c.slug}>
            <span className="h-2 w-2 rounded-full" style={{ background: c.color }} />
            {c.name}
            <span className="opacity-60">{c.landmark_count}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/** Caption over the globe in the opening shot. */
export function GlobeCaption() {
  const t = useT()
  const mode = useAppStore((s) => s.mode)
  if (mode !== 'globe') return null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[18vh] z-20 text-center" aria-live="polite">
      <p className="kicker rise">{t('centralAsia')}</p>
      <p className="rise mt-3 font-display text-5xl md:text-7xl" style={{ animationDelay: '1.2s' }}>
        {t('brand')}
      </p>
    </div>
  )
}
