import type { LandmarkDetail } from '../../api/types'
import { useT } from '../../i18n/strings'
import { useAppStore } from '../../store/useAppStore'
import { ArrowLeft } from '../icons'
import { Paragraphs, SourceList } from './Text'

/** Information about the selected hotspot; the camera focuses on it meanwhile. */
export function HotspotPanel({ landmark }: { landmark: LandmarkDetail }) {
  const t = useT()
  const activeId = useAppStore((s) => s.activeHotspot)
  const setActive = useAppStore((s) => s.setActiveHotspot)
  const index = landmark.hotspots.findIndex((h) => h.id === activeId)
  const hotspot = index >= 0 ? landmark.hotspots[index] : null

  if (!hotspot) {
    if (!landmark.hotspots.length) return null
    return (
      <nav aria-label={t('hotspots')} className="fixed left-4 top-36 z-20 hidden max-w-56 md:left-8 md:top-40 lg:block">
        <p className="kicker mb-2">{t('hotspots')}</p>
        <ol className="space-y-1">
          {landmark.hotspots.map((h, i) => (
            <li key={h.id}>
              <button type="button" onClick={() => setActive(h.id)} className="flex items-center gap-2 text-left text-xs text-mist hover:text-parchment">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-gold-400 text-[0.6rem] font-semibold text-ink-900">{i + 1}</span>
                {h.title}
              </button>
            </li>
          ))}
        </ol>
      </nav>
    )
  }

  return (
    <section
      aria-live="polite"
      aria-labelledby="hotspot-title"
      className="glass rise fixed left-4 right-4 top-36 z-30 max-h-[40vh] overflow-y-auto rounded-2xl p-5 md:left-8 md:right-auto md:top-40 md:w-80 lg:max-h-[60vh]"
    >
      <p className="kicker">
        {t('hotspots')} · {index + 1}/{landmark.hotspots.length}
      </p>
      <h2 id="hotspot-title" className="mt-2 font-display text-3xl leading-tight">
        {hotspot.title}
      </h2>
      {hotspot.image && (
        <figure className="mt-3">
          <img src={hotspot.image} alt="" className="w-full rounded-xl object-cover" />
          {hotspot.image_credit && <figcaption className="mt-1 text-[0.65rem] text-mist/70">© {hotspot.image_credit}</figcaption>}
        </figure>
      )}
      <div className="mt-3 text-sm">{hotspot.text ? <Paragraphs text={hotspot.text} /> : <p className="italic text-mist/70">{t('textSoon')}</p>}</div>
      {hotspot.history && (
        <div className="mt-4 border-t hairline pt-3 text-sm">
          <p className="kicker mb-2">{t('historySection')}</p>
          <Paragraphs text={hotspot.history} />
        </div>
      )}
      <SourceList sources={hotspot.sources} compact />
      <button type="button" onClick={() => setActive(null)} className="btn-ghost mt-4 w-full justify-center">
        <ArrowLeft />
        {t('backToModel')}
      </button>
    </section>
  )
}
