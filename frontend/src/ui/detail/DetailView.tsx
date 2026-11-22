import { Link } from 'react-router-dom'
import { ApiError } from '../../api/client'
import { useLandmark } from '../../api/hooks'
import { useT } from '../../i18n/strings'
import { useAppStore } from '../../store/useAppStore'
import { HotspotPanel } from './HotspotPanel'
import { InfoPanel } from './InfoPanel'
import { TimeSlider } from './TimeSlider'
import { TopBar } from './TopBar'

/** Everything around the 3D model on /place/:slug. Also used without 3D (2D fallback). */
export function DetailView({ slug, webgl }: { slug: string; webgl: boolean }) {
  const t = useT()
  const { data, error, refetch } = useLandmark(slug)
  const mode = useAppStore((s) => s.mode)
  // In 3D the panels wait for the camera to land; in 2D they show immediately.
  const visible = !webgl || mode === 'detail'

  if (error) {
    const missing = error instanceof ApiError && error.status === 404
    return (
      <div className="fixed inset-0 z-30 grid place-items-center px-4">
        <div className="glass rounded-2xl p-8 text-center" role="alert">
          <p>{missing ? t('notFound') : t('error')}</p>
          {missing ? (
            <Link to="/" className="btn-ghost mt-4">
              {t('back')}
            </Link>
          ) : (
            <button type="button" className="btn-ghost mt-4" onClick={() => refetch()}>
              {t('retry')}
            </button>
          )}
        </div>
      </div>
    )
  }
  if (!data || data.slug !== slug) return null

  return (
    <main id="content" className={`transition-opacity duration-700 ${visible ? 'opacity-100' : 'pointer-events-none opacity-0'}`}>
      <TopBar slug={slug} />
      <InfoPanel landmark={data} webgl={webgl} />
      {webgl && data.eras.length > 1 && <TimeSlider landmark={data} />}
      {webgl && <HotspotPanel landmark={data} />}
    </main>
  )
}
