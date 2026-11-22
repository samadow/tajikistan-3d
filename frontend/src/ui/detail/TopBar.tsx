import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useLandmarks } from '../../api/hooks'
import { useT } from '../../i18n/strings'
import { useAppStore } from '../../store/useAppStore'
import { ArrowLeft, ChevronLeft, ChevronRight } from '../icons'

/** Back to map + previous/next landmark. Keyboard: Esc, ← and →. */
export function TopBar({ slug }: { slug: string }) {
  const t = useT()
  const navigate = useNavigate()
  const { data: all } = useLandmarks()
  const hotspotOpen = useAppStore((s) => s.activeHotspot !== null)
  const closeHotspot = useAppStore((s) => s.setActiveHotspot)
  const index = all?.findIndex((l) => l.slug === slug) ?? -1

  useEffect(() => {
    const go = (delta: number) => {
      if (!all || index < 0) return
      navigate(`/place/${all[(index + delta + all.length) % all.length].slug}`)
    }
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('input, textarea, [role="dialog"]')) return
      if (e.key === 'Escape') {
        if (hotspotOpen) closeHotspot(null)
        else navigate('/')
      }
      if (e.key === 'ArrowRight') go(1)
      if (e.key === 'ArrowLeft') go(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [all, index, navigate, hotspotOpen, closeHotspot])

  const neighbour = (delta: number) => (all && index >= 0 ? all[(index + delta + all.length) % all.length] : null)
  const prev = neighbour(-1)
  const next = neighbour(1)

  return (
    <div className="pointer-events-none fixed inset-x-0 top-20 z-30 flex items-center justify-between px-4 md:top-24 md:px-8 lg:right-[min(36rem,42vw)]">
      <Link to="/" className="btn-ghost glass pointer-events-auto">
        <ArrowLeft />
        {t('back')}
      </Link>
      {all && index >= 0 && prev && next && (
        <div className="pointer-events-auto flex items-center gap-2">
          <Link to={`/place/${prev.slug}`} className="icon-btn glass" aria-label={`${t('prev')}: ${prev.name}`}>
            <ChevronLeft />
          </Link>
          <span className="w-14 text-center text-xs tabular-nums tracking-widest text-mist">
            {String(index + 1).padStart(2, '0')} / {String(all.length).padStart(2, '0')}
          </span>
          <Link to={`/place/${next.slug}`} className="icon-btn glass" aria-label={`${t('next')}: ${next.name}`}>
            <ChevronRight />
          </Link>
        </div>
      )}
    </div>
  )
}
