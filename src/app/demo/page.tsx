'use client'

import Link from 'next/link'

/* ── Theme tokens (coherente con signup + ranking + torneo form) ───── */
const theme = {
  bg: '#ffffff',
  card: '#ffffff',
  text: '#1a1a2e',
  textMuted: '#4a5568',
  textFaint: '#94a3b8',
  border: '#e2e8f0',
  borderSoft: '#edf1f5',
  gold: '#c4992a',
} as const

interface DemoCard {
  href: string
  title: string
  description: string
  eyebrow: string
  accent: 'gold' | 'blue' | 'green' | 'violet'
  liveBadge?: boolean
}

const CARDS: DemoCard[] = [
  {
    href: '/ronda-libre/DEMO01',
    title: 'Ronda amistosa',
    description: 'Seguí 8 jugadores scoreando en tiempo real en Los Leones. Leaderboard, stableford, neto — todo funcionando.',
    eyebrow: 'Espectador en vivo',
    accent: 'gold',
    liveBadge: true,
  },
  {
    href: '/torneo/demo-copa-chile-2026',
    title: 'Copa Golfers+ Chile',
    description: 'Torneo de exhibición con el formato completo: leaderboard oficial, handicap, formato Stroke Play.',
    eyebrow: 'Torneo demo',
    accent: 'blue',
  },
  {
    href: '/ranking',
    title: 'Ranking Chile',
    description: 'Top 50 jugadores por Índice Golfers+ — el cálculo propio de la app basado en los mejores diferenciales.',
    eyebrow: 'Ranking nacional',
    accent: 'violet',
  },
  {
    href: '/indices',
    title: 'Intelligence',
    description: 'Laboratorio de fórmulas: cómo calculamos el Índice Golfers+, el CPI, y las métricas de coaching.',
    eyebrow: 'Bajo el capó',
    accent: 'green',
  },
]

const ACCENT_STYLES: Record<DemoCard['accent'], { border: string; shadow: string; eyebrow: string }> = {
  gold:   { border: '#c4992a', shadow: '0 4px 20px rgba(196,153,42,0.10)',  eyebrow: '#c4992a' },
  blue:   { border: '#2563eb', shadow: '0 4px 20px rgba(37,99,235,0.08)',   eyebrow: '#2563eb' },
  green:  { border: '#16a34a', shadow: '0 4px 20px rgba(22,163,74,0.08)',   eyebrow: '#16a34a' },
  violet: { border: '#7c3aed', shadow: '0 4px 20px rgba(124,58,237,0.08)',  eyebrow: '#7c3aed' },
}

export default function DemoPage() {
  return (
    <div style={{ minHeight: '100vh', background: theme.bg, padding: '32px 16px 80px' }}>
      <div style={{ maxWidth: '720px', margin: '0 auto' }}>
        {/* Hero */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            fontSize: '11px',
            color: theme.textMuted,
            fontFamily: '"DM Mono", ui-monospace, monospace',
            letterSpacing: '0.15em',
            textTransform: 'uppercase' as const,
            marginBottom: '8px',
          }}>
            Explora Golfers+
          </div>
          <h1 style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: 'clamp(32px, 7vw, 44px)',
            color: theme.text,
            margin: '0 0 10px',
            letterSpacing: '-0.02em',
            lineHeight: 1.08,
            fontWeight: 600,
          }}>
            Un vistazo real,<br />sin cuenta.
          </h1>
          <p style={{
            fontSize: '15px',
            color: theme.textMuted,
            margin: '0 auto',
            lineHeight: 1.6,
            maxWidth: '500px',
          }}>
            Las pantallas que vas a ver son las que usa un jugador real. Cambia solo que los datos son de
            ejemplo — así explorás sin fricción antes de registrarte.
          </p>
        </div>

        {/* Cards grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '14px',
          marginBottom: '36px',
        }}>
          {CARDS.map(card => {
            const style = ACCENT_STYLES[card.accent]
            return (
              <Link
                key={card.href}
                href={card.href}
                style={{
                  display: 'block',
                  background: theme.card,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '16px',
                  padding: '20px',
                  textDecoration: 'none',
                  transition: 'border-color 180ms, box-shadow 180ms, transform 180ms',
                  minHeight: '148px',
                  position: 'relative',
                }}
                onMouseEnter={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement
                  el.style.borderColor = style.border
                  el.style.boxShadow = style.shadow
                  el.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={(e) => {
                  const el = e.currentTarget as HTMLAnchorElement
                  el.style.borderColor = theme.border
                  el.style.boxShadow = 'none'
                  el.style.transform = 'none'
                }}
              >
                {/* Eyebrow + live badge */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <span style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: style.eyebrow,
                    fontFamily: '"DM Mono", ui-monospace, monospace',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase' as const,
                  }}>
                    {card.eyebrow}
                  </span>
                  {card.liveBadge && (
                    <span style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '5px',
                      background: 'rgba(22,163,74,0.10)',
                      color: '#15803d',
                      fontSize: '9px',
                      fontWeight: 700,
                      fontFamily: '"DM Mono", ui-monospace, monospace',
                      letterSpacing: '0.1em',
                      padding: '3px 8px',
                      borderRadius: '999px',
                    }}>
                      <span style={{
                        width: '6px',
                        height: '6px',
                        borderRadius: '50%',
                        background: '#16a34a',
                        animation: 'livePulse 1.8s ease infinite',
                      }} />
                      EN VIVO
                    </span>
                  )}
                </div>

                {/* Title */}
                <div style={{
                  fontFamily: '"Playfair Display", serif',
                  fontSize: '20px',
                  fontWeight: 600,
                  color: theme.text,
                  marginBottom: '6px',
                  letterSpacing: '-0.01em',
                }}>
                  {card.title}
                </div>

                {/* Description */}
                <p style={{
                  fontSize: '13px',
                  color: theme.textMuted,
                  lineHeight: 1.5,
                  margin: 0,
                }}>
                  {card.description}
                </p>

                {/* Arrow hint */}
                <div style={{
                  position: 'absolute',
                  bottom: '18px',
                  right: '20px',
                  fontSize: '18px',
                  color: theme.textFaint,
                  transition: 'color 180ms, transform 180ms',
                }}>
                  →
                </div>
              </Link>
            )
          })}
        </div>

        {/* Footer CTA */}
        <div style={{
          background: theme.card,
          border: `1px solid ${theme.borderSoft}`,
          borderRadius: '16px',
          padding: '24px',
          textAlign: 'center',
        }}>
          <div style={{
            fontFamily: '"Playfair Display", serif',
            fontSize: '20px',
            fontWeight: 600,
            color: theme.text,
            marginBottom: '6px',
            letterSpacing: '-0.01em',
          }}>
            ¿Listo para scorear lo tuyo?
          </div>
          <p style={{ fontSize: '13px', color: theme.textMuted, margin: '0 0 16px', lineHeight: 1.5 }}>
            Creá cuenta gratis y empezá a trackear tus rondas. Sin tarjeta, sin spam.
          </p>
          <Link href="/register" style={{
            display: 'inline-block',
            background: theme.gold,
            color: '#ffffff',
            fontSize: '14px',
            fontWeight: 600,
            padding: '12px 28px',
            borderRadius: '10px',
            textDecoration: 'none',
            boxShadow: '0 2px 10px rgba(196,153,42,0.25)',
          }}>
            Crear cuenta gratis →
          </Link>
        </div>
      </div>

      <style>{`
        @keyframes livePulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(1.15); }
        }
      `}</style>
    </div>
  )
}
