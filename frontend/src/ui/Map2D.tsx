import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCategories, useLandmarks } from '../api/hooks'
import { useT } from '../i18n/strings'
import type { Bounds } from '../lib/geo'
import { StarMark } from './Ornament'

/**
 * Fallback for browsers without WebGL: an SVG map from the same border data
 * plus a card list. Detail pages reuse <DetailView> without the 3D stage.
 */
export function Map2D() {
  const t = useT()
  const navigate = useNavigate()
  const { data: landmarks } = useLandmarks()
  const { data: categories } = useCategories()
  const [geo, setGeo] = useState<{ bounds: Bounds; border: [number, number][][] } | null>(null)

  useEffect(() => {
    Promise.all([fetch('/terrain/bounds.json').then((r) => r.json()), fetch('/terrain/border.json').then((r) => r.json())]).then(([bounds, border]) =>
      setGeo({ bounds, border }),
    )
  }, [])

  const colors = useMemo(() => Object.fromEntries((categories ?? []).map((c) => [c.slug, c.color])), [categories])

  const W = 1000
  const H = geo ? (W * geo.bounds.mapDepth) / geo.bounds.mapWidth : 745
  const px = (lon: number) => (geo ? ((lon - geo.bounds.lonMin) / (geo.bounds.lonMax - geo.bounds.lonMin)) * W : 0)
  const py = (lat: number) => (geo ? ((geo.bounds.latMax - lat) / (geo.bounds.latMax - geo.bounds.latMin)) * H : 0)

  return (
    <div className="scrollbar-thin fixed inset-0 overflow-y-auto bg-[radial-gradient(ellipse_at_top,#16214a,#070d22_60%)] px-4 pb-16 pt-24 md:px-10">
      <p className="glass mx-auto mb-6 max-w-3xl rounded-xl px-4 py-3 text-center text-xs text-mist">{t('noWebgl')}</p>
      {geo && (
        <svg viewBox={`0 0 ${W} ${H}`} className="mx-auto w-full max-w-5xl" role="img" aria-label={t('brand')}>
          {geo.border.map((ring, i) => (
            <path
              key={i}
              d={`M${ring.map(([lon, lat]) => `${px(lon).toFixed(1)},${py(lat).toFixed(1)}`).join('L')}Z`}
              fill="#16214a"
              stroke="#d4a64a"
              strokeWidth={1.5}
            />
          ))}
          {landmarks?.map((lm) => (
            <g key={lm.slug} transform={`translate(${px(lm.longitude)},${py(lm.latitude)})`} className="cursor-pointer" onClick={() => navigate(`/place/${lm.slug}`)}>
              <circle r={14} fill={colors[lm.category] ?? '#d4a64a'} opacity={0.2} />
              <circle r={5} fill={colors[lm.category] ?? '#d4a64a'} />
              <text y={-12} textAnchor="middle" fill="#f4ecdc" fontSize={14} fontFamily="Cormorant Garamond, serif">
                {lm.name}
              </text>
            </g>
          ))}
        </svg>
      )}
      <ol className="mx-auto mt-10 grid max-w-5xl gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {landmarks?.map((lm, i) => (
          <li key={lm.slug}>
            <button type="button" onClick={() => navigate(`/place/${lm.slug}`)} className="glass flex w-full items-start gap-3 rounded-2xl p-5 text-left">
              <StarMark size={18} className="mt-1 shrink-0 text-gold-400" />
              <span>
                <span className="text-[0.6rem] tracking-[0.3em] text-gold-400">{String(i + 1).padStart(2, '0')}</span>
                <span className="block font-display text-2xl">{lm.name}</span>
                <span className="text-xs text-mist">{lm.subtitle}</span>
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}
