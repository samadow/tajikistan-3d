/** Search box of the real map: the platform's landmarks first, then any OSM place in Tajikistan. */
import { useQuery } from '@tanstack/react-query'
import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { LandmarkMapItem } from '../api/types'
import { useT } from '../i18n/strings'
import { useAppStore } from '../store/useAppStore'
import { Close, SearchIcon } from '../ui/icons'
import { normalise } from '../ui/SearchPalette'
import { searchPlaces, type PlaceResult } from './geocode'

export type SearchPick = { type: 'landmark'; landmark: LandmarkMapItem } | { type: 'place'; place: PlaceResult }

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

export function MapSearch({ landmarks, onPick }: { landmarks: LandmarkMapItem[]; onPick: (pick: SearchPick) => void }) {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const listId = useId()
  const box = useRef<HTMLDivElement>(null)
  const query = useDebounced(text.trim(), 250)

  const local = useMemo(() => {
    const q = normalise(query)
    if (!q) return []
    return landmarks.filter((l) => normalise(`${l.name} ${l.subtitle}`).includes(q)).slice(0, 4)
  }, [landmarks, query])

  const remote = useQuery({
    queryKey: ['photon', query, lang],
    queryFn: ({ signal }) => searchPlaces(query, lang, signal),
    enabled: query.length >= 2,
    staleTime: 10 * 60_000,
    retry: 1,
  })

  const picks: SearchPick[] = [
    ...local.map((landmark) => ({ type: 'landmark' as const, landmark })),
    ...(remote.data ?? []).map((place) => ({ type: 'place' as const, place })),
  ]

  useEffect(() => setActive(0), [query])
  useEffect(() => {
    const onDown = (e: PointerEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [])

  const choose = (pick: SearchPick) => {
    onPick(pick)
    setText(pick.type === 'landmark' ? pick.landmark.name : pick.place.name)
    setOpen(false)
  }

  return (
    <div ref={box} className="pointer-events-auto fixed left-4 right-4 top-20 z-30 md:left-6 md:right-auto md:top-24 md:w-[400px]">
      <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-neutral-900 shadow-lg ring-1 ring-black/5">
        <SearchIcon className="shrink-0 text-neutral-500" />
        <input
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') setActive((a) => Math.min(a + 1, picks.length - 1))
            else if (e.key === 'ArrowUp') setActive((a) => Math.max(a - 1, 0))
            else if (e.key === 'Enter' && picks[active]) choose(picks[active])
            else if (e.key === 'Escape') setOpen(false)
            else return
            e.preventDefault()
          }}
          placeholder={t('searchPlaces')}
          aria-label={t('searchPlaces')}
          role="combobox"
          aria-expanded={open && picks.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          className="min-w-0 flex-1 bg-transparent text-[0.95rem] outline-none placeholder:text-neutral-400"
        />
        {remote.isFetching && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-600" />}
        {text && (
          <button type="button" aria-label={t('close')} onClick={() => setText('')} className="grid h-7 w-7 place-items-center rounded-full text-neutral-500 hover:bg-neutral-100">
            <Close width={16} height={16} />
          </button>
        )}
      </div>
      {open && query.length >= 2 && (
        <ul id={listId} role="listbox" className="mt-2 max-h-[60vh] overflow-y-auto rounded-2xl bg-white py-2 text-neutral-900 shadow-xl ring-1 ring-black/5">
          {picks.map((pick, i) => {
            const key = pick.type === 'landmark' ? `l-${pick.landmark.slug}` : `p-${pick.place.id}-${i}`
            const name = pick.type === 'landmark' ? pick.landmark.name : pick.place.name
            const detail = pick.type === 'landmark' ? pick.landmark.subtitle : pick.place.detail
            return (
              <li
                key={key}
                role="option"
                aria-selected={i === active}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault()
                  choose(pick)
                }}
                className={`flex cursor-pointer items-start gap-3 px-4 py-2.5 ${i === active ? 'bg-neutral-100' : ''}`}
              >
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${pick.type === 'landmark' ? 'bg-amber-500' : 'bg-neutral-400'}`} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{name}</span>
                  {detail && <span className="block truncate text-xs text-neutral-500">{detail}</span>}
                </span>
              </li>
            )
          })}
          {!remote.isFetching && picks.length === 0 && <li className="px-4 py-3 text-sm text-neutral-500">{t('noResults')}</li>}
        </ul>
      )}
    </div>
  )
}
