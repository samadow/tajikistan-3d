import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCategories, useLandmarks } from '../api/hooks'
import { useT } from '../i18n/strings'
import { SearchIcon } from './icons'

/** Case- and diacritic-insensitive matching (ӣ → и, ҳ → х …) so Tajik names are easy to type. */
export function normalise(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[ӣ]/g, 'и')
    .replace(/[ӯ]/g, 'у')
    .replace(/[ҳ]/g, 'х')
    .replace(/[қ]/g, 'к')
    .replace(/[ғ]/g, 'г')
    .replace(/[ҷ]/g, 'ч')
}

/** Ctrl+K / "/" quick search over the landmarks in the current language. */
export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useT()
  const navigate = useNavigate()
  const { data: landmarks } = useLandmarks()
  const { data: categories } = useCategories()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)

  const results = useMemo(() => {
    const q = normalise(query.trim())
    const list = landmarks ?? []
    if (!q) return list.slice(0, 8)
    // Rank: name starts with the query > name contains it > subtitle contains it.
    const score = (name: string, subtitle: string) => {
      const n = normalise(name)
      if (n.startsWith(q) || n.split(/\s+/).some((w) => w.startsWith(q))) return 3
      if (n.includes(q)) return 2
      return normalise(subtitle).includes(q) ? 1 : 0
    }
    return list
      .map((l) => ({ l, s: score(l.name, l.subtitle) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map((x) => x.l)
      .slice(0, 8)
  }, [landmarks, query])

  const categoryName = (slug: string) => categories?.find((c) => c.slug === slug)?.name ?? ''

  useEffect(() => {
    if (open) {
      setQuery('')
      setActive(0)
      requestAnimationFrame(() => input.current?.focus())
    }
  }, [open])

  if (!open) return null
  const go = (slug: string) => {
    onClose()
    navigate(`/place/${slug}`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-950/70 px-4 pt-[12vh] backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal aria-label={t('search')} className="glass rise w-full max-w-xl overflow-hidden rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 border-b hairline px-5">
          <SearchIcon className="text-gold-400" />
          <input
            ref={input}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setActive((a) => Math.min(a + 1, results.length - 1))
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setActive((a) => Math.max(a - 1, 0))
              }
              if (e.key === 'Enter' && results[active]) go(results[active].slug)
            }}
            placeholder={t('searchPlaceholder')}
            aria-label={t('search')}
            aria-controls="search-results"
            aria-activedescendant={results[active] ? `search-${results[active].slug}` : undefined}
            className="w-full bg-transparent py-4 text-lg text-parchment outline-none placeholder:text-mist/60"
          />
          <kbd className="hidden rounded border hairline px-1.5 text-[0.6rem] text-mist sm:block">Esc</kbd>
        </div>
        <ul id="search-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && <li className="px-4 py-6 text-center text-sm text-mist">{t('noResults')}</li>}
          {results.map((l, i) => (
            <li
              key={l.slug}
              id={`search-${l.slug}`}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onClick={() => go(l.slug)}
              className={`flex cursor-pointer items-center justify-between gap-4 rounded-xl px-4 py-3 ${i === active ? 'bg-gold-500/15' : ''}`}
            >
              <span>
                <span className="block font-display text-xl leading-tight">{l.name}</span>
                <span className="text-xs text-mist">{l.subtitle}</span>
              </span>
              <span className="shrink-0 text-[0.6rem] uppercase tracking-widest text-gold-400">{categoryName(l.category)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
