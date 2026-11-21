import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { useLandmarks } from '../api/hooks'
import { useT } from '../i18n/strings'
import { useAppStore } from '../store/useAppStore'
import { setStoryProgress } from '../three/camera/director'
import { Rosette } from './Ornament'

gsap.registerPlugin(ScrollTrigger)

/**
 * Guided tour. The page scrolls normally; a scrubbed ScrollTrigger maps scroll
 * progress onto the camera path built in director.buildStoryPath().
 * Sections: intro, one per landmark, outro — each exactly one viewport tall,
 * so section i is centred when the camera reaches key i.
 */
export function StoryMode() {
  const t = useT()
  const container = useRef<HTMLDivElement>(null)
  const { data: landmarks } = useLandmarks()
  const mode = useAppStore((s) => s.mode)
  const storyIndex = useAppStore((s) => s.storyIndex)
  const ready = mode === 'story'

  useEffect(() => {
    document.body.classList.add('is-scrollable')
    window.scrollTo(0, 0)
    return () => document.body.classList.remove('is-scrollable')
  }, [])

  useEffect(() => {
    if (!ready || !container.current || !landmarks) return
    const trigger = ScrollTrigger.create({
      trigger: container.current,
      start: 'top top',
      end: 'bottom bottom',
      scrub: 1.2,
      onUpdate: (self) => setStoryProgress(self.progress),
    })
    setStoryProgress(0)
    return () => trigger.kill()
  }, [ready, landmarks])

  if (!landmarks) return null
  const total = landmarks.length

  return (
    <div ref={container} className={`relative z-20 transition-opacity duration-700 ${ready ? 'opacity-100' : 'opacity-0'}`}>
      <section className="flex h-screen items-end px-4 pb-24 md:items-center md:px-12 md:pb-0">
        <div className="max-w-xl">
          <p className="kicker">{t('journey')}</p>
          <h1 className="mt-4 whitespace-pre-line font-display text-6xl font-medium leading-[0.95] md:text-8xl">{t('heroTitle')}</h1>
          <div className="ornament-band mt-6 w-48" />
          <p className="mt-6 flex items-center gap-3 text-sm text-mist">
            <span className="inline-block h-10 w-px animate-pulse bg-gold-400" />
            {t('scrollHint')}
          </p>
        </div>
      </section>

      {landmarks.map((lm, i) => {
        const active = storyIndex === i + 1
        const right = i % 2 === 1
        return (
          <section key={lm.slug} className={`flex h-screen items-end px-4 pb-10 md:items-center md:px-12 md:pb-0 ${right ? 'md:justify-end' : ''}`}>
            <article
              className={`glass max-w-md rounded-3xl p-7 transition-all duration-700 md:p-9 ${active ? 'translate-y-0 opacity-100' : 'translate-y-8 opacity-0'}`}
            >
              <p className="flex items-baseline gap-3">
                <span className="font-display text-5xl text-gold-400">{String(i + 1).padStart(2, '0')}</span>
                <span className="text-xs tracking-[0.3em] text-mist">/ {String(total).padStart(2, '0')}</span>
              </p>
              <h2 className="mt-3 font-display text-4xl font-medium leading-tight md:text-5xl">{lm.name}</h2>
              {lm.subtitle && <p className="mt-2 font-display text-lg italic text-gold-300/90">{lm.subtitle}</p>}
              <div className="ornament-band my-5 w-32" />
              {lm.short_description && <p className="text-sm leading-relaxed text-parchment/85">{lm.short_description}</p>}
              <p className="mt-4 text-xs tracking-widest text-mist">
                {lm.elevation_m.toLocaleString('ru-RU')} {t('m')}
              </p>
              <Link to={`/place/${lm.slug}`} className="btn-gold mt-6">
                {t('open')}
              </Link>
            </article>
          </section>
        )
      })}

      <section className="flex h-screen flex-col items-center justify-center gap-6 px-4 text-center">
        <Rosette size={96} className="text-gold-400 spin-slow" />
        <h2 className="font-display text-5xl">{t('endOfJourney')}</h2>
        <Link to="/" className="btn-ghost glass">
          {t('explore')}
        </Link>
      </section>
    </div>
  )
}
