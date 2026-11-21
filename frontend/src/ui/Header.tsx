import { Link, NavLink } from 'react-router-dom'
import { LANGS, useT } from '../i18n/strings'
import { useAppStore } from '../store/useAppStore'
import { StarMark } from './Ornament'

export function Header({ webgl }: { webgl: boolean }) {
  const t = useT()
  const lang = useAppStore((s) => s.lang)
  const setLang = useAppStore((s) => s.setLang)
  const night = useAppStore((s) => s.timeOfDay === 'night')
  const toggle = useAppStore((s) => s.toggleTimeOfDay)

  const nav = ({ isActive }: { isActive: boolean }) =>
    `relative px-1 py-1 text-xs uppercase tracking-[0.24em] transition-colors ${isActive ? 'text-gold-300' : 'text-mist hover:text-parchment'}`

  return (
    <header className="pointer-events-none fixed inset-x-0 top-0 z-30 flex items-center justify-between gap-4 px-4 pt-4 md:px-8 md:pt-6">
      <Link to="/" className="pointer-events-auto flex items-center gap-3 text-gold-400" aria-label={t('brand')}>
        <StarMark size={30} />
        <span className="font-display text-xl leading-none text-parchment md:text-2xl">
          {t('brand')}
          <sup className="ml-1 font-sans text-[0.6rem] tracking-[0.2em] text-gold-400">{t('brandSub')}</sup>
        </span>
      </Link>

      <nav className="pointer-events-auto hidden items-center gap-6 md:flex" aria-label="Main">
        <NavLink to="/" end className={nav}>
          {t('map')}
        </NavLink>
        {webgl && (
          <NavLink to="/story" className={nav}>
            {t('journey')}
          </NavLink>
        )}
      </nav>

      <div className="pointer-events-auto flex items-center gap-2">
        {webgl && (
          <button type="button" onClick={toggle} className="icon-btn" aria-label={night ? t('day') : t('night')} title={night ? t('day') : t('night')}>
            {night ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <circle cx="12" cy="12" r="4.5" />
                <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z" />
              </svg>
            )}
          </button>
        )}
        <div className="glass flex rounded-full p-1" role="group" aria-label="Language">
          {LANGS.map((l) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setLang(l.code)}
              aria-pressed={lang === l.code}
              className={`rounded-full px-3 py-1.5 text-[0.7rem] font-medium tracking-widest transition-colors ${lang === l.code ? 'bg-gold-400 text-ink-900' : 'text-mist hover:text-parchment'}`}
            >
              {l.label}
            </button>
          ))}
        </div>
      </div>
    </header>
  )
}
