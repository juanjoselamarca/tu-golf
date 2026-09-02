// src/app/torneo/[slug]/components/TournamentNavTabs.tsx
//
// Barra de navegacion por tabs dentro del torneo publico.
// Conecta las vistas: Leaderboard | En Vivo | Inscripcion (si open).
// Mobile: scroll horizontal. Desktop: centrado.

import Link from 'next/link'

export interface TournamentNavTabsProps {
  slug: string
  /** Pestaña activa: 'info' (landing), 'en-vivo', 'unirse'. */
  activeTab: 'info' | 'en-vivo' | 'unirse'
  /** Mostrar tab "Inscripcion" solo si el torneo acepta inscripciones. */
  showJoinTab: boolean
  /** Mostrar tab "En Vivo" solo si hay algo que mostrar. */
  showLiveTab: boolean
}

interface TabDef {
  key: string
  label: string
  href: string
}

export function TournamentNavTabs({
  slug,
  activeTab,
  showJoinTab,
  showLiveTab,
}: TournamentNavTabsProps) {
  const tabs: TabDef[] = [
    { key: 'info', label: 'Leaderboard', href: `/torneo/${slug}` },
  ]

  if (showLiveTab) {
    tabs.push({ key: 'en-vivo', label: 'En Vivo', href: `/torneo/${slug}/en-vivo` })
  }

  if (showJoinTab) {
    tabs.push({ key: 'unirse', label: 'Inscripcion', href: `/torneo/${slug}/unirse` })
  }

  // Si solo hay 1 tab no tiene sentido mostrar navegacion
  if (tabs.length <= 1) return null

  return (
    <nav
      className="tournament-nav-tabs"
      style={{
        maxWidth: '1080px',
        margin: '0 auto',
        padding: '0 16px',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: '0',
          overflowX: 'auto',
          WebkitOverflowScrolling: 'touch',
          scrollbarWidth: 'none',
          borderBottom: '1px solid var(--border, rgba(26,29,36,0.08))',
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab
          return (
            <Link
              key={tab.key}
              href={tab.href}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: '12px 20px',
                fontSize: '14px',
                fontWeight: isActive ? 700 : 500,
                fontFamily: "var(--font-dm-sans, 'DM Sans', sans-serif)",
                color: isActive
                  ? 'var(--brand, #c4992a)'
                  : 'var(--text-2, #5a6573)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                borderBottom: isActive
                  ? '2px solid var(--brand, #c4992a)'
                  : '2px solid transparent',
                marginBottom: '-1px',
                transition: 'color 150ms, border-color 150ms',
                minHeight: '44px',
              }}
            >
              {tab.label}
            </Link>
          )
        })}
      </div>
      <style>{`
        .tournament-nav-tabs div::-webkit-scrollbar { display: none; }
      `}</style>
    </nav>
  )
}
