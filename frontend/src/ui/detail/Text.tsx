import type { Source } from '../../api/types'
import { useT } from '../../i18n/strings'

/** CMS text: blank lines separate paragraphs. */
export function Paragraphs({ text, className = '' }: { text: string; className?: string }) {
  return (
    <>
      {text
        .split(/\n\s*\n/)
        .filter(Boolean)
        .map((p, i) => (
          <p key={i} className={`mb-4 leading-relaxed text-parchment/85 last:mb-0 ${className}`}>
            {p}
          </p>
        ))}
    </>
  )
}

export function Soon() {
  const t = useT()
  return <p className="italic text-mist/70">{t('textSoon')}</p>
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="kicker mb-3">{title}</h2>
      {children}
    </section>
  )
}

/** Citations for historical statements, so every claim can be traced. */
export function SourceList({ sources, compact = false }: { sources: Source[]; compact?: boolean }) {
  const t = useT()
  if (!sources.length) return null
  return (
    <div className={compact ? 'mt-3' : 'mt-8'}>
      {!compact && <h2 className="kicker mb-3">{t('sources')}</h2>}
      <ol className="space-y-2 text-xs leading-relaxed text-mist">
        {sources.map((s) => {
          const label = s.citation || [s.author, s.title, s.publisher, s.year].filter(Boolean).join(', ')
          return (
            <li key={s.id} className="flex gap-2">
              <span className="text-gold-500" aria-hidden>
                ◆
              </span>
              {s.url ? (
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="underline decoration-gold-500/40 underline-offset-2 hover:text-parchment">
                  {label}
                </a>
              ) : (
                <span>{label}</span>
              )}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
