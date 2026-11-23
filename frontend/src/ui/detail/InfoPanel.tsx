import { Link } from 'react-router-dom'
import { useNearby } from '../../api/hooks'
import type { LandmarkDetail } from '../../api/types'
import { formatCoordinates, formatNumber, useT } from '../../i18n/strings'
import { pickModel } from '../../lib/models'
import { useAppStore } from '../../store/useAppStore'
import { Gallery } from './Gallery'
import { Paragraphs, Section, Soon, SourceList } from './Text'

function Fact({ label, children, wide = false }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? 'col-span-2' : ''}>
      <dt className="kicker !text-[0.6rem] !text-mist">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  )
}

function Nearby({ landmark }: { landmark: LandmarkDetail }) {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  const { data } = useNearby({ lat: landmark.latitude, lon: landmark.longitude, slug: landmark.slug })
  if (!data?.length) return null
  return (
    <Section title={t('nearby')}>
      <ul className="grid gap-2">
        {data.map((n) => (
          <li key={n.slug}>
            <Link to={`/place/${n.slug}`} className="group flex items-center justify-between gap-4 rounded-xl border hairline px-4 py-3 transition-colors hover:bg-gold-500/10">
              <span>
                <span className="block font-display text-lg leading-tight group-hover:text-gold-300">{n.name}</span>
                <span className="text-xs text-mist">{n.subtitle}</span>
              </span>
              {n.distance_km !== null && (
                <span className="shrink-0 text-xs tabular-nums text-gold-400">
                  {formatNumber(n.distance_km, lang)} {t('km')}
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}

/** The side panel (desktop) / bottom sheet (mobile) with everything about a landmark. */
export function InfoPanel({ landmark, webgl }: { landmark: LandmarkDetail; webgl: boolean }) {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  const quality = useAppStore((s) => s.quality)
  const model = pickModel(landmark.models, quality)

  return (
    <aside
      key={landmark.slug}
      aria-labelledby="landmark-title"
      className={`glass scrollbar-thin fixed z-20 overflow-y-auto ${
        webgl
          ? 'inset-x-0 bottom-0 max-h-[46vh] rounded-t-3xl lg:bottom-4 lg:left-auto lg:right-4 lg:top-24 lg:max-h-none lg:w-[min(34rem,40vw)] lg:rounded-3xl'
          : 'inset-x-0 bottom-0 top-20 rounded-t-3xl md:left-auto md:right-4 md:top-24 md:bottom-4 md:w-[34rem] md:rounded-3xl'
      }`}
    >
      {landmark.poster_thumbnail ? (
        <div className="relative h-56 overflow-hidden lg:h-72">
          <img
            src={landmark.poster_thumbnail}
            srcSet={landmark.poster ? `${landmark.poster_thumbnail} 800w, ${landmark.poster} 1600w` : undefined}
            sizes="(min-width: 1024px) 34rem, 100vw"
            alt=""
            className="h-full w-full object-cover"
          />
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
        <h1 id="landmark-title" className="mt-3 font-display text-5xl font-medium leading-[0.95] text-balance md:text-6xl">
          {landmark.name}
        </h1>
        {landmark.subtitle && <p className="mt-3 font-display text-xl italic text-gold-300/90">{landmark.subtitle}</p>}
        <div className="ornament-band my-6 w-full" />

        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm">
          <Fact label={t('elevation')}>
            <span className="font-display text-2xl">
              {formatNumber(landmark.elevation_m, lang)} <span className="text-base text-mist">{t('m')}</span>
            </span>
          </Fact>
          <Fact label={t('coordinates')}>
            <span className="tabular-nums">{formatCoordinates(landmark.latitude, landmark.longitude, lang, t)}</span>
          </Fact>
          <Fact label={t('bestSeason')} wide>
            {landmark.best_season || <span className="italic text-mist/70">—</span>}
          </Fact>
        </dl>
        <Link
          to={`/map#${landmark.placeholder === 'settlement' ? 13 : 12.5}/${landmark.latitude.toFixed(5)}/${landmark.longitude.toFixed(5)}/0/55`}
          className="btn-ghost mt-6 inline-flex"
        >
          {t('openRealMap')} →
        </Link>

        {landmark.short_description && <p className="mt-8 text-lg leading-relaxed text-parchment">{landmark.short_description}</p>}

        <Section title={t('story')}>{landmark.full_description ? <Paragraphs text={landmark.full_description} /> : <Soon />}</Section>

        {(landmark.history || landmark.sources.length > 0) && (
          <Section title={t('historySection')}>{landmark.history ? <Paragraphs text={landmark.history} /> : <Soon />}</Section>
        )}

        {landmark.images.length > 0 && <Gallery images={landmark.images} />}

        <Section title={t('howToGet')}>{landmark.how_to_get_there ? <Paragraphs text={landmark.how_to_get_there} /> : <Soon />}</Section>

        <Nearby landmark={landmark} />
        <SourceList sources={landmark.sources} />

        <footer className="mt-10 space-y-1 border-t hairline pt-4 text-[0.7rem] text-mist/70">
          {webgl && !model && <p>{t('placeholderModel')}</p>}
          {model?.is_illustrative && <p>{t('illustrative')}</p>}
          {model?.credit && (
            <p>
              {t('modelCredit')}: {model.credit}
              {model.license && ` · ${model.license}`}
            </p>
          )}
          {landmark.poster_credit && <p>© {landmark.poster_credit}</p>}
          {landmark.coordinates_source && (
            <p>
              {t('coordsSource')} {landmark.coordinates_source}
            </p>
          )}
        </footer>
      </div>
    </aside>
  )
}
