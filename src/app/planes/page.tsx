'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import { MasterCodeActivator } from '@/components/billing/MasterCodeActivator'
import { addToast } from '@/hooks/useToast'

/* ─── constants ─── */

const MONTHLY_PRICE = '$4.990'
const YEARLY_PRICE = '$34.990'
const YEARLY_MONTHLY_EQUIV = '$2.916'

const FREE_FEATURES = [
  'Todos los formatos bruto',
  'Scoring completo',
  'Índice Golfers+',
  'Import de rondas',
  'Leaderboard',
  'Historial básico',
  'Perfil y ranking',
]

const PRO_FEATURES = [
  'Todo lo de Gratis',
  'Coach tAIger+ con IA',
  'Plan de mejora personalizado',
  'Detección de patrones',
  'Golf Win Index',
  'Historial avanzado',
  'Leaderboard en vivo',
  'Modos neto avanzados',
  'Herramientas de organizador',
  'Modo TV',
  'Share cards premium',
]

/* ─── shared inline-style fragments ─── */

const PLAYFAIR = '"Playfair Display", serif'
const DM_SANS = '"DM Sans", sans-serif'
const DM_MONO = '"DM Mono", ui-monospace, monospace'

const TEXT_PRIMARY = '#edeae4'
const TEXT_SECONDARY = 'rgba(237,234,228,0.35)'
const TEXT_TERTIARY = 'rgba(237,234,228,0.2)'
const GOLD = '#C4992A'
const BG = '#070d18'

/* ─── component ─── */

export default function PlanesPage() {
  const [yearly, setYearly] = useState(true)

  return (
    <div
      style={{
        background: BG,
        minHeight: '100dvh',
        color: TEXT_PRIMARY,
        fontFamily: DM_SANS,
        fontWeight: 300,
        WebkitFontSmoothing: 'antialiased',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      <Suspense><MasterCodeActivator /></Suspense>

      {/* Film grain texture */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          opacity: 0.03,
          pointerEvents: 'none',
          backgroundImage:
            'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 256 256\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23n)\'/%3E%3C/svg%3E")',
          backgroundRepeat: 'repeat',
          backgroundSize: '128px 128px',
          zIndex: 0,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: 480,
          margin: '0 auto',
          padding: '0 24px',
          paddingBottom: 80,
        }}
      >
        {/* ── Back link ── */}
        <div style={{ paddingTop: 20, paddingBottom: 48 }}>
          <Link
            href="/dashboard"
            style={{
              color: TEXT_SECONDARY,
              textDecoration: 'none',
              fontSize: 14,
              fontWeight: 400,
              letterSpacing: '0.01em',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 44,
            }}
          >
            ← Volver
          </Link>
        </div>

        {/* ── Hero ── */}
        <div style={{ marginBottom: 56 }}>
          <h1
            style={{
              fontFamily: PLAYFAIR,
              fontSize: 40,
              fontWeight: 400,
              letterSpacing: '-0.035em',
              lineHeight: 1.05,
              margin: 0,
              color: TEXT_PRIMARY,
            }}
          >
            Tu mejor golf
            <br />
            empieza acá
          </h1>
          <p
            style={{
              fontSize: 15,
              fontWeight: 300,
              color: TEXT_SECONDARY,
              margin: 0,
              marginTop: 16,
              lineHeight: 1.5,
            }}
          >
            Pro incluye coach con IA, patrones, índices avanzados y más.
          </p>
        </div>

        {/* ── Toggle mensual/anual ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            marginBottom: 56,
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: !yearly ? TEXT_PRIMARY : TEXT_SECONDARY,
              transition: 'color 0.2s',
            }}
          >
            Mensual
          </span>
          <button
            onClick={() => setYearly(!yearly)}
            aria-label={yearly ? 'Cambiar a plan mensual' : 'Cambiar a plan anual'}
            style={{
              position: 'relative',
              width: 52,
              height: 28,
              borderRadius: 14,
              border: `1px solid ${yearly ? GOLD : 'rgba(237,234,228,0.15)'}`,
              background: yearly
                ? 'rgba(196,153,42,0.15)'
                : 'rgba(237,234,228,0.06)',
              cursor: 'pointer',
              padding: 0,
              transition: 'all 0.2s',
              flexShrink: 0,
              minHeight: 44,
              minWidth: 52,
            }}
          >
            <div
              style={{
                position: 'absolute',
                top: 3,
                left: yearly ? 25 : 3,
                width: 20,
                height: 20,
                borderRadius: '50%',
                background: yearly ? GOLD : TEXT_SECONDARY,
                transition: 'left 0.2s, background 0.2s',
              }}
            />
          </button>
          <span
            style={{
              fontSize: 14,
              fontWeight: 400,
              color: yearly ? TEXT_PRIMARY : TEXT_SECONDARY,
              transition: 'color 0.2s',
            }}
          >
            Anual
          </span>
          {yearly && (
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: GOLD,
                letterSpacing: '0.02em',
              }}
            >
              Ahorra 42%
            </span>
          )}
        </div>

        {/* ── Plan Gratis ── */}
        <section style={{ marginBottom: 48 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <h2
              style={{
                fontFamily: PLAYFAIR,
                fontSize: 22,
                fontWeight: 400,
                letterSpacing: '-0.03em',
                margin: 0,
              }}
            >
              Gratis
            </h2>
            <span
              style={{
                fontFamily: DM_MONO,
                fontSize: 22,
                fontWeight: 400,
                color: TEXT_PRIMARY,
              }}
            >
              $0
            </span>
          </div>
          <p
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              margin: 0,
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            Todo lo esencial para registrar tus rondas.
          </p>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {FREE_FEATURES.map((f) => (
              <li
                key={f}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 14,
                  fontWeight: 300,
                  color: 'rgba(237,234,228,0.6)',
                  paddingTop: 10,
                  paddingBottom: 10,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: 'rgba(237,234,228,0.2)',
                    flexShrink: 0,
                  }}
                />
                {f}
              </li>
            ))}
          </ul>

          <button
            disabled
            style={{
              width: '100%',
              height: 48,
              marginTop: 24,
              borderRadius: 8,
              border: '1px solid rgba(237,234,228,0.12)',
              background: 'transparent',
              color: TEXT_SECONDARY,
              fontFamily: DM_SANS,
              fontSize: 15,
              fontWeight: 400,
              cursor: 'default',
              letterSpacing: '0.01em',
            }}
          >
            Plan actual
          </button>
        </section>

        {/* ── Hairline separator ── */}
        <div
          style={{
            height: 1,
            background: 'rgba(237,234,228,0.06)',
            marginBottom: 48,
          }}
        />

        {/* ── Plan Pro ── */}
        <section style={{ marginBottom: 64 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              justifyContent: 'space-between',
              marginBottom: 8,
            }}
          >
            <h2
              style={{
                fontFamily: PLAYFAIR,
                fontSize: 22,
                fontWeight: 400,
                letterSpacing: '-0.03em',
                margin: 0,
              }}
            >
              Pro
            </h2>
            <div style={{ textAlign: 'right' }}>
              <span
                style={{
                  fontFamily: DM_MONO,
                  fontSize: 22,
                  fontWeight: 400,
                  color: TEXT_PRIMARY,
                }}
              >
                {yearly ? YEARLY_PRICE : MONTHLY_PRICE}
              </span>
              <span
                style={{
                  fontSize: 13,
                  color: TEXT_SECONDARY,
                  marginLeft: 4,
                }}
              >
                /{yearly ? 'año' : 'mes'}
              </span>
            </div>
          </div>
          {yearly && (
            <p
              style={{
                fontSize: 13,
                color: TEXT_SECONDARY,
                margin: 0,
                marginBottom: 4,
                textAlign: 'right',
                fontFamily: DM_MONO,
              }}
            >
              {YEARLY_MONTHLY_EQUIV}/mes
            </p>
          )}
          <p
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              margin: 0,
              marginBottom: 24,
              lineHeight: 1.5,
            }}
          >
            Entiende tu juego, mejora con cada ronda.
          </p>

          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {PRO_FEATURES.map((f) => (
              <li
                key={f}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  fontSize: 14,
                  fontWeight: 300,
                  color: 'rgba(237,234,228,0.6)',
                  paddingTop: 10,
                  paddingBottom: 10,
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: '50%',
                    background: GOLD,
                    flexShrink: 0,
                  }}
                />
                {f}
              </li>
            ))}
          </ul>

          <button
            onClick={() => addToast({ type: 'info', title: 'Próximamente', message: 'Estamos preparando el sistema de pagos. Te avisaremos cuando esté listo.' })}
            style={{
              width: '100%',
              height: 52,
              marginTop: 28,
              borderRadius: 8,
              border: 'none',
              background: GOLD,
              color: '#070d18',
              fontFamily: DM_SANS,
              fontSize: 16,
              fontWeight: 500,
              cursor: 'pointer',
              letterSpacing: '0.01em',
              minHeight: 52,
            }}
          >
            Probar 14 días gratis
          </button>
          <p
            style={{
              fontSize: 12,
              color: TEXT_SECONDARY,
              textAlign: 'center',
              margin: 0,
              marginTop: 12,
            }}
          >
            Sin tarjeta · cancelas cuando quieras
          </p>
        </section>

        {/* ── Founding Member ── */}
        <section
          style={{
            textAlign: 'center',
            marginBottom: 64,
            padding: '40px 0',
            borderTop: '1px solid rgba(237,234,228,0.06)',
            borderBottom: '1px solid rgba(237,234,228,0.06)',
          }}
        >
          <p
            style={{
              fontFamily: DM_MONO,
              fontSize: 48,
              fontWeight: 400,
              color: TEXT_PRIMARY,
              margin: 0,
              lineHeight: 1,
            }}
          >
            73
          </p>
          <p
            style={{
              fontSize: 14,
              color: TEXT_SECONDARY,
              margin: 0,
              marginTop: 8,
              letterSpacing: '0.02em',
            }}
          >
            cupos de 100
          </p>
          <p
            style={{
              fontSize: 14,
              color: 'rgba(237,234,228,0.45)',
              margin: 0,
              marginTop: 16,
              lineHeight: 1.6,
              maxWidth: 280,
              marginLeft: 'auto',
              marginRight: 'auto',
            }}
          >
            Founding Members pagan este precio de por vida.
            <br />
            Después sube.
          </p>
        </section>

        {/* ── Trust ── */}
        <section style={{ textAlign: 'center', paddingBottom: 24 }}>
          {[
            'Sin tarjeta de crédito para probar.',
            'Cancelas cuando quieras.',
            'Tus datos son tuyos, siempre.',
          ].map((line) => (
            <p
              key={line}
              style={{
                fontSize: 13,
                color: TEXT_TERTIARY,
                margin: 0,
                lineHeight: 2.2,
              }}
            >
              {line}
            </p>
          ))}
        </section>
      </div>
    </div>
  )
}
