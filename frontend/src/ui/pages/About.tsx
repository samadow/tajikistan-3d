import { usePage } from '../../api/hooks'
import { useT } from '../../i18n/strings'
import { Paragraphs, Soon } from '../detail/Text'
import { PageShell, Spinner } from './PageShell'

/** "About Tajikistan" — fully editable in the admin (Site pages → about). */
export default function About() {
  const t = useT()
  const { data, isError } = usePage('about')
  return (
    <PageShell kicker={t('brand')} title={data?.title ?? t('about')} lead={data?.lead}>
      {!data && !isError && <Spinner />}
      {isError && <p className="text-mist">{t('error')}</p>}
      {data && <div className="max-w-3xl text-lg">{data.body ? <Paragraphs text={data.body} /> : <Soon />}</div>}
      <p className="mt-16 max-w-3xl border-t hairline pt-6 text-xs leading-relaxed text-mist/70">{t('footer')}</p>
    </PageShell>
  )
}
