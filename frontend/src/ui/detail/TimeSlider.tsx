import type { LandmarkDetail } from '../../api/types'
import { formatRange, useT } from '../../i18n/strings'
import { pickModel } from '../../lib/models'
import { useAppStore } from '../../store/useAppStore'
import { SourceList } from './Text'

/** Historical time machine: one era at a time, or two side by side ("compare"). */
export function TimeSlider({ landmark }: { landmark: LandmarkDetail }) {
  const t = useT()
  const eraIndex = useAppStore((s) => s.eraIndex)
  const setEraIndex = useAppStore((s) => s.setEraIndex)
  const compare = useAppStore((s) => s.compareEras)
  const toggleCompare = useAppStore((s) => s.toggleCompare)
  const quality = useAppStore((s) => s.quality)
  const eras = landmark.eras
  const era = eras[eraIndex] ?? eras[0]
  const model = pickModel(era.models.length ? era.models : landmark.models, quality)
  const dateLabel = formatRange(era.year, era.year_end, t, era.year_is_approximate)

  return (
    <div className="glass scrollbar-thin fixed bottom-[calc(46vh+0.5rem)] left-1/2 z-30 max-h-[40vh] w-[min(28rem,calc(100vw-2rem))] -translate-x-1/2 overflow-y-auto rounded-2xl px-5 py-3 lg:bottom-8 lg:left-[calc((100vw-min(34rem,40vw))/2)] lg:max-h-[45vh] lg:px-6 lg:py-4">
      <div className="mb-2 flex items-baseline justify-between gap-3 lg:mb-3">
        <span className="kicker">{t('timeline')}</span>
        <span className="font-display text-2xl text-gold-300" aria-live="polite">
          {dateLabel}
        </span>
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
        aria-valuetext={`${era.label} — ${dateLabel}`}
      />
      <div className="mt-3 flex justify-between gap-2 text-xs">
        {eras.map((e, i) => (
          <button key={e.id} type="button" onClick={() => setEraIndex(i)} className={`transition-colors ${i === eraIndex ? 'text-parchment' : 'text-mist/60 hover:text-mist'}`}>
            {e.label}
          </button>
        ))}
      </div>
      {era.description && <p className="mt-3 text-xs leading-relaxed text-mist">{era.description}</p>}
      <SourceList sources={era.sources} compact />
      <div className="mt-3 flex items-center justify-between gap-3 border-t hairline pt-3">
        <span className="text-[0.65rem] text-mist/70">{model?.is_illustrative !== false ? t('illustrative') : ''}</span>
        <button type="button" onClick={toggleCompare} aria-pressed={compare} className="shrink-0 rounded-full border border-gold-500/40 px-3 py-1 text-[0.65rem] uppercase tracking-widest text-gold-300 hover:bg-gold-500/10">
          {compare ? t('compareOff') : t('compare')}
        </button>
      </div>
    </div>
  )
}
