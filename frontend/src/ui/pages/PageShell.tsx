import { useEffect, type ReactNode } from 'react'

/** Scrollable content page layered over the dimmed 3D map. */
export function PageShell({ kicker, title, lead, children }: { kicker: string; title: string; lead?: string; children: ReactNode }) {
  useEffect(() => {
    document.title = `${title} · Tajikistan 3D`
  }, [title])
  return (
    <div className="fixed inset-0 z-20 overflow-y-auto bg-ink-900/80 backdrop-blur-md scrollbar-thin">
      <main id="content" className="mx-auto max-w-6xl px-4 pb-24 pt-28 md:px-8 md:pt-36">
        <p className="kicker rise">{kicker}</p>
        <h1 className="rise mt-3 font-display text-5xl font-medium leading-[0.95] text-balance md:text-7xl">{title}</h1>
        {lead && <p className="rise mt-5 max-w-2xl text-lg leading-relaxed text-mist">{lead}</p>}
        <div className="ornament-band rise my-10 w-48" />
        {children}
      </main>
    </div>
  )
}

export function Spinner() {
  return <div className="mx-auto my-16 h-8 w-8 animate-spin rounded-full border-2 border-gold-500/30 border-t-gold-400" role="status" aria-label="…" />
}
