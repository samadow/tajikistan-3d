import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef } from 'react'
import { Link, useMatch } from 'react-router-dom'
import { useStories, useStory } from '../api/hooks'
import { formatNumber, useT } from '../i18n/strings'
import { prefersReducedMotion } from '../lib/device'
import { useAppStore } from '../store/useAppStore'
import { Rosette } from './Ornament'

gsap.registerPlugin(ScrollTrigger)

/**
 * Guided tour (loaded lazily with GSAP). The page scrolls normally; a scrubbed
 * ScrollTrigger writes progress into the store and the 3D chunk turns it into a
 * camera position on the story spline. Sections: intro, one per step, outro —
 * each one viewport tall, so section i is centred when the camera reaches key i.
 */
export default function StoryMode() {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  const container = useRef<HTMLDivElement>(null)
  const match = useMatch('/story/:slug')
  const { data: stories } = useStories()
  const slug = match?.params.slug ?? stories?.find((s) => s.is_default)?.slug ?? stories?.[0]?.slug ?? null
  const { data: story } = useStory(slug)
  const mode = useAppStore((s) => s.mode)
  const storyIndex = useAppStore((s) => s.storyIndex)
  const setProgress = useAppStore((s) => s.setStoryProgress)
  const ready = mode === 'story'

  useEffect(() => {
    document.body.classList.add('is-scrollable')
    window.scrollTo(0, 0)
    return () => document.body.classList.remove('is-scrollable')
  }, [slug])

  useEffect(() => {
    if (!ready || !container.current || !story) return
    const reduced = prefersReducedMotion()
    const trigger = ScrollTrigger.create({
      trigger: container.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: reduced ? true : 1.2,
      onUpdate: (self) => setProgress(self.progress),
    })
    setProgress(0)
    return () => trigger.kill()
  }, [ready, story, setProgress])

  if (!story) return null
  const steps = story.steps
  const total = steps.length
  const goTo = (i: number) => {
    const el = container.current?.children[i] as HTMLElement | undefined
    el?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })
  }

  return (
    <>
      <div ref={container} id="content" className={`relative z-20 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}>
        <section className="flex h-screen items-end px-4 pb-24 md:items-center md:px-12 md:pb-0">
          <div className="max-w-xl">
            <p className="kicker">{t('stories')}</p>
            <h1 className="mt-4 font-display text-6xl font-medium leading-[0.95] md:text-8xl">{story.title}</h1>
            {story.subtitle && <p className="mt-4 font-display text-2xl italic text-gold-300/90">{story.subtitle}</p>}
            {story.intro && <p className="mt-4 max-w-md leading-relaxed text-parchment/85">{story.intro}</p>}
            <div className="ornament-band mt-6 w-48" />
            <p className="mt-6 flex items-center gap-3 text-sm text-mist">
              <span className="inline-block h-10 w-px animate-pulse bg-gold-400" />
              {t('scrollHint')}
            </p>
          </div>
        </section>

        {steps.map((step, i) => {
          const active = storyIndex === i + 1
          const right = i % 2 === 1
          return (
            <section key={step.id} className={`flex h-screen items-end px-4 pb-10 md:items-center md:px-12 md:pb-0 ${right ? 'md:justify-end' : ''}`} aria-label={step.title}>
              <article className={`glass max-w-md rounded-3xl p-7 transition-all duration-700 md:p-9 ${active ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}>
                <p className="flex items-baseline gap-3">
                  <span className="font-display text-5xl text-gold-400">{String(i + 1).padStart(2, '0')}</span>
                  <span className="text-xs tracking-[0.3em] text-mist">/ {String(total).padStart(2, '0')}</span>
                </p>
                <h2 className="mt-3 font-display text-4xl font-medium leading-tight md:text-5xl">{step.title}</h2>
                {step.landmark?.subtitle && <p className="mt-2 font-display text-lg italic text-gold-300/90">{step.landmark.subtitle}</p>}
                <div className="ornament-band my-5 w-32" />
                {step.image && (
                  <figure className="mb-4">
                    <img src={step.image} alt="" loading="lazy" className="max-h-48 w-full rounded-xl object-cover" />
                    {step.image_credit && <figcaption className="mt-1 text-[0.6rem] text-mist/70">© {step.image_credit}</figcaption>}
                  </figure>
                )}
                {step.text && <p className="text-sm leading-relaxed text-parchment/85">{step.text}</p>}
                {step.landmark && (
                  <>
                    <p className="mt-4 text-xs tracking-widest text-mist">
                      {formatNumber(step.landmark.elevation_m, lang)} {t('m')}
                    </p>
                    <Link to={`/place/${step.landmark.slug}`} className="btn-gold mt-6">
                      {t('open')}
                    </Link>
                  </>
                )}
              </article>
            </section>
          )
        })}

        <section className="flex h-screen flex-col items-center justify-center gap-6 px-4 text-center">
          <Rosette size={96} className="spin-slow text-gold-400" />
          <h2 className="font-display text-5xl">{t('endOfJourney')}</h2>
          <Link to="/" className="btn-ghost glass">
            {t('explore')}
          </Link>
        </section>
      </div>

      {/* Progress rail: one dot per stop, clickable. */}
      <nav aria-label={t('stories')} className={`fixed right-3 top-1/2 z-30 hidden -translate-y-1/2 flex-col gap-2 md:flex ${ready ? '' : 'invisible'}`}>
        {steps.map((step, i) => (
          <button
            key={step.id}
            type="button"
            onClick={() => goTo(i + 1)}
            aria-label={step.title}
            aria-current={storyIndex === i + 1 ? 'step' : undefined}
            className={`group flex items-center justify-end gap-2`}
          >
            <span className="pointer-events-none text-[0.65rem] text-mist opacity-0 transition-opacity group-hover:opacity-100">{step.title}</span>
            <span className={`h-2 w-2 rotate-45 transition-all ${storyIndex === i + 1 ? 'scale-150 bg-gold-400' : 'bg-gold-500/30 group-hover:bg-gold-500/70'}`} />
          </button>
        ))}
      </nav>
      <div className="fixed inset-x-0 top-0 z-30 h-0.5 bg-gold-500/10" aria-hidden>
        <div className="h-full bg-gold-400 transition-[width] duration-300" style={{ width: `${(storyIndex / (total + 1)) * 100}%` }} />
      </div>
    </>
  )
}
