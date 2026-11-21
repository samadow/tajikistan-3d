import { useEffect, useState } from 'react'
import { useT } from '../i18n/strings'
import { Rosette } from './Ornament'

/**
 * Full-screen loader. Progress combines the terrain build (the heavy part) with
 * three.js loader progress; the rosette is "embroidered" as it fills.
 */
export function Loader({ progress, done }: { progress: number; done: boolean }) {
  const t = useT()
  const [hidden, setHidden] = useState(false)
  const [shown, setShown] = useState(0)

  // Ease the displayed number so it never jumps backwards or stalls visibly.
  useEffect(() => {
    let raf = 0
    const tick = () => {
      setShown((v) => {
        const target = done ? 100 : Math.min(progress, 96)
        return v + (target - v) * 0.08 + (target > v ? 0.05 : 0)
      })
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [progress, done])

  useEffect(() => {
    if (!done) return
    const id = setTimeout(() => setHidden(true), 1400)
    return () => clearTimeout(id)
  }, [done])

  if (hidden) return null
  const pct = Math.min(100, Math.round(shown))
  return (
    <div
      className={`fixed inset-0 z-50 grid place-items-center bg-ink-900 transition-opacity duration-1000 ${done && pct >= 99 ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={t('loading')}
    >
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgb(34_48_95/0.6),transparent_65%)]" />
      <div className="relative flex flex-col items-center gap-8">
        <div className="relative text-gold-400">
          <Rosette size={168} progress={shown / 100} className="spin-slow" />
          <span className="absolute inset-0 grid place-items-center font-display text-3xl text-parchment tabular-nums">
            {pct}
          </span>
        </div>
        <div className="flex flex-col items-center gap-3">
          <p className="font-display text-4xl tracking-wide md:text-5xl">{t('brand')}</p>
          <p className="kicker">{t('loading')}…</p>
        </div>
        <div className="h-px w-56 overflow-hidden bg-gold-500/20">
          <div className="h-full bg-gold-400 transition-[width] duration-300" style={{ width: `${pct}%` }} />
        </div>
      </div>
    </div>
  )
}

/** Ornamental curtain used to hide the cut between the map and a detail stage. */
export function Veil({ active }: { active: boolean }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none fixed inset-0 z-40 grid place-items-center bg-ink-900 transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`}
    >
      <Rosette size={80} className="text-gold-500/60 spin-slow" />
    </div>
  )
}
