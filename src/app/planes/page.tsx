'use client'

import { useState } from 'react'
import Link from 'next/link'
import { FoundingMemberBadge } from '@/components/billing/FoundingMemberBadge'

/**
 * /planes — Pricing page.
 *
 * Display-only: no payment processing, CTAs link to "#".
 * Dark navy background, glassmorphism cards, gold accents.
 * Mobile-first (390px), 3-column grid on desktop.
 */

// ── Shared styles ─────────────────────────────────────────

const cardBase: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  backdropFilter: 'blur(20px)',
  WebkitBackdropFilter: 'blur(20px)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: '16px',
  padding: '28px 22px',
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
}

const checkIcon = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
    <path d="M5 13l4 4L19 7" />
  </svg>
)

interface TierCardProps {
  name: string
  tagline: string
  price: string
  priceNote?: string
  features: string[]
  cta: string
  ctaStyle: 'solid' | 'outline' | 'disabled'
  highlighted?: boolean
  badge?: string
}

function TierCard({ name, tagline, price, priceNote, features, cta, ctaStyle, highlighted, badge }: TierCardProps) {
  const ctaStyles: Record<string, React.CSSProperties> = {
    solid: {
      background: 'linear-gradient(135deg, #f5b732, #c4992a)',
      color: '#070d18',
      border: 'none',
      fontWeight: 700,
      cursor: 'pointer',
    },
    outline: {
      background: 'transparent',
      color: '#c4992a',
      border: '1px solid rgba(196,153,42,0.4)',
      fontWeight: 600,
      cursor: 'pointer',
    },
    disabled: {
      background: 'transparent',
      color: 'rgba(255,255,255,0.3)',
      border: '1px solid rgba(255,255,255,0.1)',
      fontWeight: 500,
      cursor: 'default',
    },
  }

  return (
    <div style={{
      ...cardBase,
      ...(highlighted ? {
        border: '1px solid rgba(196,153,42,0.35)',
        boxShadow: '0 0 40px rgba(196,153,42,0.06)',
        position: 'relative' as const,
      } : {}),
    }}>
      {badge && (
        <div style={{
          position: 'absolute',
          top: '-12px',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'linear-gradient(135deg, #f5b732, #c4992a)',
          color: '#070d18',
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          padding: '4px 14px',
          borderRadius: '20px',
          whiteSpace: 'nowrap',
        }}>
          {badge}
        </div>
      )}

      <div>
        <h3 style={{
          fontFamily: 'var(--font-playfair, "Playfair Display"), serif',
          fontSize: '22px',
          fontWeight: 700,
          color: '#fff',
          margin: '0 0 4px',
        }}>
          {name}
        </h3>
        <p style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.5)',
          margin: 0,
          lineHeight: 1.4,
        }}>
          {tagline}
        </p>
      </div>

      <div>
        <div style={{
          fontFamily: 'var(--font-dm-mono, "DM Mono"), monospace',
          fontSize: '28px',
          fontWeight: 600,
          color: '#fff',
          lineHeight: 1.1,
        }}>
          {price}
        </div>
        {priceNote && (
          <p style={{
            fontSize: '12px',
            color: 'rgba(255,255,255,0.4)',
            margin: '4px 0 0',
          }}>
            {priceNote}
          </p>
        )}
      </div>

      <ul style={{
        listStyle: 'none',
        margin: 0,
        padding: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        flex: 1,
      }}>
        {features.map((f) => (
          <li key={f} style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '8px',
            fontSize: '14px',
            color: 'rgba(255,255,255,0.75)',
            lineHeight: 1.4,
          }}>
            <span style={{ color: highlighted ? '#c4992a' : 'rgba(255,255,255,0.35)' }}>
              {checkIcon}
            </span>
            {f}
          </li>
        ))}
      </ul>

      <a
        href="#"
        onClick={(e) => { if (ctaStyle === 'disabled') e.preventDefault() }}
        style={{
          display: 'block',
          textAlign: 'center',
          padding: '13px 24px',
          borderRadius: '10px',
          fontSize: '14px',
          letterSpacing: '0.02em',
          textDecoration: 'none',
          transition: 'opacity 0.2s',
          minHeight: '44px',
          lineHeight: '18px',
          ...ctaStyles[ctaStyle],
        }}
      >
        {cta}
      </a>
    </div>
  )
}

// ── Billing toggle ────────────────────────────────────────

function BillingToggle({ annual, onToggle }: { annual: boolean; onToggle: () => void }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '12px',
      marginBottom: '40px',
    }}>
      <span style={{
        fontSize: '14px',
        fontWeight: annual ? 400 : 600,
        color: annual ? 'rgba(255,255,255,0.4)' : '#fff',
        transition: 'color 0.2s',
      }}>
        Mensual
      </span>
      <button
        onClick={onToggle}
        aria-label={annual ? 'Cambiar a mensual' : 'Cambiar a anual'}
        style={{
          width: '48px',
          height: '26px',
          borderRadius: '13px',
          background: annual ? 'rgba(196,153,42,0.3)' : 'rgba(255,255,255,0.15)',
          border: '1px solid rgba(255,255,255,0.1)',
          cursor: 'pointer',
          position: 'relative',
          padding: 0,
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute',
          top: '2px',
          left: annual ? '23px' : '2px',
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: annual ? '#c4992a' : '#fff',
          transition: 'left 0.2s, background 0.2s',
        }} />
      </button>
      <span style={{
        fontSize: '14px',
        fontWeight: annual ? 600 : 400,
        color: annual ? '#fff' : 'rgba(255,255,255,0.4)',
        transition: 'color 0.2s',
      }}>
        Anual
      </span>
      {annual && (
        <span style={{
          fontSize: '11px',
          fontWeight: 600,
          color: '#c4992a',
          background: 'rgba(196,153,42,0.12)',
          padding: '3px 8px',
          borderRadius: '4px',
          letterSpacing: '0.02em',
        }}>
          Ahorra 30%
        </span>
      )}
    </div>
  )
}

// ── Trust item ────────────────────────────────────────────

function TrustItem({ text }: { text: string }) {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '8px',
      fontSize: '13px',
      color: 'rgba(255,255,255,0.5)',
    }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'rgba(196,153,42,0.5)' }}>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      </svg>
      {text}
    </div>
  )
}

// ── Page ──────────────────────────────────────────────────

export default function PlanesPage() {
  const [annual, setAnnual] = useState(false)

  const freeFeatures = [
    'Todos los formatos de juego',
    'Scoring completo',
    'Indice Golfers+',
    'Import de rondas',
    'Leaderboard',
  ]

  const proFeatures = [
    'Todo lo de Gratis',
    'Coach tAIger+',
    'Plan de mejora personalizado',
    'GWI (Golf Worth Index)',
    'Historial avanzado',
    'Leaderboard en vivo',
    'Herramientas organizador',
  ]

  const proPlusFeatures = [
    'Todo lo de Pro',
    'Proyeccion de handicap',
    'Objetivo de temporada',
    'Comparativas con otros jugadores',
    'Export de datos',
  ]

  return (
    <div style={{
      background: '#070d18',
      minHeight: '100vh',
      color: '#fff',
      paddingBottom: 'calc(80px + env(safe-area-inset-bottom, 0px))',
    }}>
      {/* ── Hero ── */}
      <div style={{
        textAlign: 'center',
        padding: '48px 20px 32px',
        maxWidth: '600px',
        margin: '0 auto',
      }}>
        <Link href="/dashboard" style={{
          fontSize: '13px',
          color: 'rgba(255,255,255,0.4)',
          textDecoration: 'none',
          display: 'inline-block',
          marginBottom: '32px',
        }}>
          &#8592; Volver
        </Link>

        <h1 style={{
          fontFamily: 'var(--font-playfair, "Playfair Display"), serif',
          fontSize: 'clamp(28px, 6vw, 40px)',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
          margin: '0 0 12px',
        }}>
          Elige tu plan
        </h1>
        <p style={{
          fontSize: '15px',
          color: 'rgba(255,255,255,0.5)',
          margin: '0 0 36px',
          lineHeight: 1.5,
        }}>
          Cada plan te acerca mas a tu mejor golf
        </p>

        <BillingToggle annual={annual} onToggle={() => setAnnual(!annual)} />
      </div>

      {/* ── Tier cards ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(0, 1fr)',
        gap: '20px',
        maxWidth: '960px',
        margin: '0 auto',
        padding: '0 20px 48px',
      }}>
        <style>{`
          @media (min-width: 768px) {
            .planes-grid { grid-template-columns: repeat(3, minmax(0, 1fr)) !important; }
          }
        `}</style>
        <div className="planes-grid" style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr)',
          gap: '20px',
        }}>
          <TierCard
            name="Gratis"
            tagline="Sabes que mejorar"
            price="$0 / siempre"
            features={freeFeatures}
            cta="Plan actual"
            ctaStyle="disabled"
          />
          <TierCard
            name="Pro"
            tagline="Te ayudo a resolverlo"
            price={annual ? '$4.990/mes' : '$6.990/mes'}
            priceNote={annual ? '$59.900/ano' : undefined}
            features={proFeatures}
            cta="Activar mi plan"
            ctaStyle="solid"
            highlighted
            badge="Mas popular"
          />
          <TierCard
            name="Pro+ Elite"
            tagline="Te llevo a tu meta del ano"
            price={annual ? '$8.325/mes' : '$11.990/mes'}
            priceNote={annual ? '$99.900/ano' : undefined}
            features={proPlusFeatures}
            cta="Activar Pro+"
            ctaStyle="outline"
          />
        </div>
      </div>

      {/* ── Founding Members ── */}
      <div style={{
        textAlign: 'center',
        padding: '40px 20px',
        maxWidth: '600px',
        margin: '0 auto',
        borderTop: '1px solid rgba(255,255,255,0.06)',
      }}>
        <p style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: 'rgba(255,255,255,0.35)',
          margin: '0 0 16px',
        }}>
          Socio Fundador
        </p>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '12px' }}>
          <FoundingMemberBadge lockedPrice="precio de por vida" />
        </div>
        <p style={{
          fontSize: '14px',
          color: 'rgba(255,255,255,0.45)',
          margin: 0,
          lineHeight: 1.5,
          maxWidth: '40ch',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          Los primeros 100 usuarios que se suscriban mantienen su precio para siempre, sin importar futuros ajustes.
        </p>
      </div>

      {/* ── Social proof ── */}
      <div style={{
        textAlign: 'center',
        padding: '24px 20px 16px',
      }}>
        <p style={{
          fontSize: '14px',
          color: 'rgba(255,255,255,0.35)',
          fontStyle: 'italic',
          margin: 0,
        }}>
          Golfistas chilenos mejorando con tAIger+
        </p>
      </div>

      {/* ── Trust layer ── */}
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        gap: '24px',
        flexWrap: 'wrap',
        padding: '16px 20px 48px',
      }}>
        <TrustItem text="Cancela cuando quieras" />
        <TrustItem text="Tus datos son tuyos" />
        <TrustItem text="Sin compromiso" />
      </div>
    </div>
  )
}
