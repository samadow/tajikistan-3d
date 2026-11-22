import { Link } from 'react-router-dom'
import { useEraTimeline } from '../../api/hooks'
import { formatRange, useT } from '../../i18n/strings'
import { PageShell, Spinner } from './PageShell'

/** Every historical period of every site, on one vertical timeline (oldest first). */
export default function History() {
  const t = useT()
  const { data, isError, refetch } = useEraTimeline()
  return (
    <PageShell kicker={t('timeline')} title={t('history')}>
      {isError && (
        <p className="text-mist" role="alert">
          {t('error')}{' '}
          <button type="button" className="text-gold-300 underline" onClick={() => refetch()}>
            {t('retry')}
          </button>
        </p>
      )}
      {!data && !isError && <Spinner />}
      {data && data.length === 0 && <p className="text-mist">{t('eraEmpty')}</p>}
      {data && data.length > 0 && (
        <ol className="relative ml-3 border-l border-gold-500/30 md:ml-40">
          {data.map((era) => (
            <li key={era.id} className="relative mb-12 pl-8 md:pl-10">
              <span className="absolute -left-[7px] top-2 h-3 w-3 rotate-45 bg-gold-400 shadow-[0_0_16px_rgb(242_196_107/0.8)]" aria-hidden />
              <p className="font-display text-2xl text-gold-300 md:absolute md:-left-40 md:top-0 md:w-32 md:text-right">
                {formatRange(era.year, era.year_end, t, era.year_is_approximate)}
              </p>
              <h2 className="mt-1 font-display text-3xl leading-tight">{era.label}</h2>
              <Link to={`/place/${era.landmark.slug}`} className="mt-1 inline-block text-sm text-gold-400 underline-offset-4 hover:underline">
                {era.landmark.name} →
              </Link>
              {era.description && <p className="mt-3 max-w-2xl leading-relaxed text-parchment/85">{era.description}</p>}
            </li>
          ))}
        </ol>
      )}
    </PageShell>
  )
}
