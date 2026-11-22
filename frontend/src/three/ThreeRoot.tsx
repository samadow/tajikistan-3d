/**
 * Entry point of the lazily loaded 3D chunk (three.js, R3F, drei, GSAP).
 * The DOM-only shell (App) never imports from ./three directly, so users of the
 * 2D fallback never download the 3D libraries.
 */
import { useLocation } from 'react-router-dom'
import { useT } from '../i18n/strings'
import { useAppStore } from '../store/useAppStore'
import { skipIntro } from './camera/director'
import Experience from './Experience'
import { SceneController } from './SceneController'

function SkipIntro() {
  const t = useT()
  const mode = useAppStore((s) => s.mode)
  const { pathname } = useLocation()
  // Content pages cover the scene, so the intro control would be out of context there.
  const onScene = pathname === '/' || pathname.startsWith('/place/') || pathname.startsWith('/story')
  if (!onScene || (mode !== 'globe' && mode !== 'intro')) return null
  return (
    <button type="button" className="btn-ghost glass fixed bottom-6 right-6 z-40" onClick={skipIntro}>
      {t('skipIntro')}
    </button>
  )
}

export default function ThreeRoot() {
  return (
    <>
      <Experience />
      <SceneController />
      <SkipIntro />
    </>
  )
}
