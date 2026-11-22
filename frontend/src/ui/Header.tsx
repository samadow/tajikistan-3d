import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { LANGS, useT, type StringKey } from '../i18n/strings'
import { useAppStore, type QualitySetting } from '../store/useAppStore'
import { Close, Expand, Menu, Moon, SearchIcon, Sliders, SoundOff, SoundOn, Sun } from './icons'
import { StarMark } from './Ornament'

const NAV: { to: string; key: StringKey; end?: boolean; needs3d?: boolean }[] = [
  { to: '/', key: 'explore', end: true },
  { to: '/discover', key: 'discover' },
  { to: '/history', key: 'history' },
  { to: '/stories', key: 'stories', needs3d: true },
  { to: '/about', key: 'about' },
]

const QUALITIES: { value: QualitySetting; key: StringKey }[] = [
  { value: 'auto', key: 'qualityAuto' },
  { value: 'high', key: 'qualityHigh' },
  { value: 'medium', key: 'qualityMedium' },
  { value: 'low', key: 'qualityLow' },
]

function LanguageSwitch() {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  return (
    <div className="glass flex rounded-full p-1" role="group" aria-label={t('language')}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          aria-label={l.name}
          className={`rounded-full px-3 py-1.5 text-[0.7rem] font-medium tracking-widest transition-colors ${lang === l.code ? 'bg-gold-400 text-ink-900' : 'text-mist hover:text-parchment'}`}
        >
          {l.label}
        </button>
      ))}
    </div>
  )
}

function Settings({ webgl }: { webgl: boolean }) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const qualitySetting = useAppStore((s) => s.qualitySetting)
  const quality = useAppStore((s) => s.quality)
  const setQuality = useAppStore((s) => s.setQualitySetting)
  const soundOn = useAppStore((s) => s.soundOn)
  const toggleSound = useAppStore((s) => s.toggleSound)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onChange)
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    else document.documentElement.requestFullscreen?.().catch(() => undefined)
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" className="icon-btn" aria-label={t('settings')} aria-expanded={open} aria-haspopup="true" onClick={() => setOpen((o) => !o)}>
        <Sliders />
      </button>
      {open && (
        <div className="glass rise absolute right-0 top-12 w-64 rounded-2xl p-4 text-sm" role="menu">
          {webgl && (
            <fieldset>
              <legend className="kicker mb-2">{t('quality')}</legend>
              <div className="grid grid-cols-2 gap-1">
                {QUALITIES.map((q) => (
                  <button
                    key={q.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={qualitySetting === q.value}
                    onClick={() => setQuality(q.value)}
                    className={`rounded-lg px-3 py-2 text-xs transition-colors ${qualitySetting === q.value ? 'bg-gold-400 text-ink-900' : 'text-mist hover:bg-gold-500/10'}`}
                  >
                    {t(q.key)}
                    {q.value === 'auto' && qualitySetting === 'auto' && ` · ${t(QUALITIES.find((x) => x.value === quality)!.key)}`}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
          <div className="mt-3 grid gap-1">
            <button type="button" role="menuitemcheckbox" aria-checked={soundOn} onClick={toggleSound} className="flex items-center justify-between rounded-lg px-3 py-2 text-mist hover:bg-gold-500/10">
              <span className="flex items-center gap-2">
                {soundOn ? <SoundOn /> : <SoundOff />}
                {t('sound')}
              </span>
              <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${soundOn ? 'bg-gold-400' : 'bg-ink-600'}`}>
                <span className={`block h-3 w-3 rounded-full bg-ink-900 transition-transform ${soundOn ? 'translate-x-3' : ''}`} />
              </span>
            </button>
            {document.fullscreenEnabled && (
              <button type="button" role="menuitemcheckbox" aria-checked={fullscreen} onClick={toggleFullscreen} className="flex items-center gap-2 rounded-lg px-3 py-2 text-mist hover:bg-gold-500/10">
                <Expand />
                {t('fullscreen')}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export function Header({ webgl, onSearch }: { webgl: boolean; onSearch: () => void }) {
  const t = useT()
  const night = useAppStore((s) => s.timeOfDay === 'night')
  const toggleTime = useAppStore((s) => s.toggleTimeOfDay)
  const [menu, setMenu] = useState(false)
  const location = useLocation()
  useEffect(() => setMenu(false), [location.pathname])

  const nav = ({ isActive }: { isActive: boolean }) =>
    `relative px-1 py-1 text-[0.7rem] uppercase tracking-[0.22em] transition-colors ${isActive ? 'text-gold-300' : 'text-mist hover:text-parchment'}`
  const items = NAV.filter((n) => webgl || !n.needs3d)

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-40 flex items-center justify-between gap-4 px-4 pt-4 md:px-8 md:pt-6">
      <Link to="/" className="pointer-events-auto flex items-center gap-3 text-gold-400" aria-label={t('brand')}>
        <StarMark size={30} />
        <span className="font-display text-xl leading-none text-parchment md:text-2xl">
          {t('brand')}
          <sup className="ml-1 font-sans text-[0.6rem] tracking-[0.2em] text-gold-400">{t('brandSub')}</sup>
        </span>
      </Link>

      <nav className="pointer-events-auto hidden items-center gap-5 xl:flex" aria-label="Main">
        {items.map((n) => (
          <NavLink key={n.to} to={n.to} end={n.end} className={nav}>
            {t(n.key)}
          </NavLink>
        ))}
      </nav>

      <div className="pointer-events-auto flex items-center gap-2">
        <button type="button" onClick={onSearch} className="icon-btn" aria-label={`${t('search')} (Ctrl+K)`} title={`${t('search')} · Ctrl+K`}>
          <SearchIcon />
        </button>
        {webgl && (
          <button type="button" onClick={toggleTime} className="icon-btn hidden sm:grid" aria-label={night ? t('day') : t('night')} title={night ? t('day') : t('night')}>
            {night ? <Sun /> : <Moon />}
          </button>
        )}
        <div className="hidden sm:block">
          <Settings webgl={webgl} />
        </div>
        <div className="hidden md:block">
          <LanguageSwitch />
        </div>
        <button type="button" className="icon-btn xl:hidden" aria-label={t('menu')} aria-expanded={menu} onClick={() => setMenu(true)}>
          <Menu />
        </button>
      </div>

      {menu && (
        <div className="pointer-events-auto fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm xl:hidden" onClick={() => setMenu(false)}>
          <div role="dialog" aria-modal aria-label={t('menu')} className="glass rise absolute inset-y-0 right-0 flex w-[min(22rem,90vw)] flex-col gap-8 p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="kicker">{t('menu')}</span>
              <button type="button" className="icon-btn" aria-label={t('close')} onClick={() => setMenu(false)} autoFocus>
                <Close />
              </button>
            </div>
            <nav className="flex flex-col gap-1" aria-label="Main">
              {items.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => `rounded-xl px-4 py-3 font-display text-2xl ${isActive ? 'bg-gold-500/15 text-gold-300' : 'text-parchment hover:bg-gold-500/10'}`}>
                  {t(n.key)}
                </NavLink>
              ))}
            </nav>
            <div className="mt-auto flex flex-wrap items-center gap-3">
              <LanguageSwitch />
              {webgl && (
                <button type="button" onClick={toggleTime} className="icon-btn" aria-label={night ? t('day') : t('night')}>
                  {night ? <Sun /> : <Moon />}
                </button>
              )}
              <Settings webgl={webgl} />
            </div>
          </div>
        </div>
      )}
    </header>
  )
}
