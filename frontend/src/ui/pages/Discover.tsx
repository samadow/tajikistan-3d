import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCatalogue, useCategories } from '../../api/hooks'
import type { LandmarkCard } from '../../api/types'
import { formatNumber, useT } from '../../i18n/strings'
import { useAppStore } from '../../store/useAppStore'
import { StarMark } from '../Ornament'
import { PageShell, Spinner } from './PageShell'

function Card({ lm }: { lm: LandmarkCard }) {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  return (
    <Link to={`/place/${lm.slug}`} className="glass group flex h-full flex-col overflow-hidden rounded-2xl transition-transform duration-500 hover:-translate-y-1">
      <div className="relative aspect-[16/10] overflow-hidden bg-ink-700">
        {lm.thumbnail ? (
          <img src={lm.thumbnail} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" />
        ) : (
          <div className="grid h-full place-items-center bg-[radial-gradient(circle_at_30%_20%,rgb(212_166_74/0.25),transparent_60%)]">
            <StarMark size={44} className="text-gold-500/60" />
          </div>
        )}
        <span className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-ink-900/80 px-3 py-1 text-[0.6rem] uppercase tracking-widest">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: lm.category.color }} />
          {lm.category.name}
        </span>
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h2 className="font-display text-2xl leading-tight group-hover:text-gold-300">{lm.name}</h2>
        <p className="mt-1 text-sm text-mist">{lm.subtitle}</p>
        {lm.short_description && <p className="mt-3 line-clamp-3 text-sm text-parchment/80">{lm.short_description}</p>}
        <p className="mt-auto pt-4 text-xs tabular-nums text-gold-400">
          {formatNumber(lm.elevation_m, lang)} {t('m')}
        </p>
      </div>
    </Link>
  )
}

export default function Discover() {
  const t = useT()
  const { data: categories } = useCategories()
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(12)

  useEffect(() => {
    const id = setTimeout(() => setDebounced(search.trim()), 250)
    return () => clearTimeout(id)
  }, [search])

  const { data, isFetching, isError, refetch } = useCatalogue({ search: debounced, category, page_size: pageSize })

  const chip = (active: boolean) =>
    `rounded-full px-4 py-2 text-[0.7rem] uppercase tracking-[0.16em] transition-colors ${active ? 'bg-gold-400 text-ink-900' : 'border hairline text-mist hover:text-parchment'}`

  return (
    <PageShell kicker={t('tagline')} title={t('discover')}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('searchPlaceholder')}
          aria-label={t('search')}
          className="glass w-full rounded-full px-5 py-3 text-parchment outline-none placeholder:text-mist/60 focus:border-gold-400 md:max-w-sm"
        />
        <div className="flex flex-wrap gap-2" role="group" aria-label={t('all')}>
          <button type="button" className={chip(!category)} aria-pressed={!category} onClick={() => setCategory(null)}>
            {t('all')}
          </button>
          {categories?.map((c) => (
            <button key={c.slug} type="button" className={chip(category === c.slug)} aria-pressed={category === c.slug} onClick={() => setCategory(category === c.slug ? null : c.slug)}>
              {c.name}
            </button>
          ))}
        </div>
      </div>

      {isError && (
        <p className="mt-10 text-center text-mist" role="alert">
          {t('error')}{' '}
          <button type="button" className="text-gold-300 underline" onClick={() => refetch()}>
            {t('retry')}
          </button>
        </p>
      )}
      {!data && !isError && <Spinner />}
      {data && data.results.length === 0 && <p className="mt-16 text-center text-mist">{t('noResults')}</p>}
      {data && (
        <>
          <p className="mt-8 text-xs text-mist" aria-live="polite">
            {data.count} {t('places')}
          </p>
          <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {data.results.map((lm) => (
              <li key={lm.slug}>
                <Card lm={lm} />
              </li>
            ))}
          </ul>
          {data.next && (
            <div className="mt-10 text-center">
              <button type="button" className="btn-ghost" disabled={isFetching} onClick={() => setPageSize((n) => n + 12)}>
                {t('loadMore')}
              </button>
            </div>
          )}
        </>
      )}
    </PageShell>
  )
}
