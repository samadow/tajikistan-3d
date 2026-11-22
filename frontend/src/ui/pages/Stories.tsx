import { Link } from 'react-router-dom'
import { useStories } from '../../api/hooks'
import { useT } from '../../i18n/strings'
import { ArrowRight } from '../icons'
import { Rosette } from '../Ornament'
import { PageShell, Spinner } from './PageShell'

export default function Stories() {
  const t = useT()
  const { data, isError, refetch } = useStories()
  return (
    <PageShell kicker={t('tagline')} title={t('stories')}>
      {isError && (
        <p className="text-mist" role="alert">
          {t('error')}{' '}
          <button type="button" className="text-gold-300 underline" onClick={() => refetch()}>
            {t('retry')}
          </button>
        </p>
      )}
      {!data && !isError && <Spinner />}
      {data && (
        <ul className="grid gap-5 md:grid-cols-2">
          {data.map((s) => (
            <li key={s.slug}>
              <Link to={`/story/${s.slug}`} className="glass group flex h-full items-center gap-6 overflow-hidden rounded-3xl p-6 transition-transform duration-500 hover:-translate-y-1">
                {s.cover ? (
                  <img src={s.cover} alt="" className="h-28 w-28 shrink-0 rounded-2xl object-cover" />
                ) : (
                  <Rosette size={96} className="shrink-0 text-gold-500/70" />
                )}
                <span className="flex-1">
                  <span className="kicker">
                    {s.step_count} {t('steps')}
                  </span>
                  <span className="mt-2 block font-display text-3xl leading-tight group-hover:text-gold-300">{s.title}</span>
                  {s.subtitle && <span className="mt-1 block text-sm text-mist">{s.subtitle}</span>}
                </span>
                <ArrowRight className="shrink-0 text-gold-400" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </PageShell>
  )
}
