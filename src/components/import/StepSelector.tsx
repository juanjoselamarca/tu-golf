'use client'

import { useRouter } from 'next/navigation'
import type { ImportSource } from './ImportWizard'

interface StepSelectorProps {
  onSelect: (source: ImportSource) => void
}

// Minimal SVG icons — professional, not childish
const IconScorecard = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <line x1="3" y1="9" x2="21" y2="9" />
    <line x1="3" y1="15" x2="21" y2="15" />
    <line x1="9" y1="3" x2="9" y2="21" />
    <line x1="15" y1="3" x2="15" y2="21" />
  </svg>
)

const IconGarmin = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L2 7l10 5 10-5-10-5z" />
    <path d="M2 17l10 5 10-5" />
    <path d="M2 12l10 5 10-5" />
  </svg>
)

const IconPlus = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const CARD_HEIGHT = '148px'

export default function StepSelector({ onSelect }: StepSelectorProps) {
  const router = useRouter()

  return (
    <div style={{ paddingTop: '24px' }}>
      <style>{`
        @keyframes selectorFadeIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <h1 style={{
        fontFamily: "'Playfair Display', serif",
        fontSize: '24px', fontWeight: 700, color: 'var(--text)',
        marginBottom: '6px', lineHeight: 1.2,
        animation: 'selectorFadeIn 0.4s ease-out both',
      }}>
        Importa tu historial de golf
      </h1>
      <p style={{
        color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.5,
        marginBottom: '28px',
        animation: 'selectorFadeIn 0.4s ease-out 0.08s both',
      }}>
        Mientras mas rondas subas, mejor te conoce tu coach tAIger+
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Option 1: Pantallazo de scorecard */}
        <button
          onClick={() => onSelect('photos')}
          style={{
            display: 'flex', alignItems: 'stretch',
            background: 'var(--bg-surface, #0e1c2f)',
            border: '1px solid rgba(196,153,42,0.25)',
            borderRadius: '16px', cursor: 'pointer',
            textAlign: 'left', color: 'var(--text)',
            minHeight: CARD_HEIGHT, overflow: 'hidden',
            transition: 'transform 0.2s, border-color 0.2s, box-shadow 0.2s',
            animation: 'selectorFadeIn 0.5s ease-out 0.12s both',
            padding: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.01)'
            e.currentTarget.style.borderColor = 'rgba(196,153,42,0.5)'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(196,153,42,0.1)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.borderColor = 'rgba(196,153,42,0.25)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          {/* Icon column */}
          <div style={{
            width: '56px', minWidth: '56px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(196,153,42,0.08)',
            borderRight: '1px solid rgba(196,153,42,0.1)',
            color: '#c4992a',
          }}>
            <IconScorecard />
          </div>

          {/* Content */}
          <div style={{ flex: 1, padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>
                Pantallazo de scorecard
              </span>
              <span style={{
                fontSize: '10px', fontWeight: 600, color: '#c4992a',
                letterSpacing: '0.04em',
              }}>
                Altisima precision
              </span>
            </div>
            <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.4 }}>
              Toma un pantallazo de cada tarjeta en Garmin Golf
            </p>
            {/* Recommendation — prominent */}
            <div style={{
              padding: '8px 12px', borderRadius: '10px',
              background: 'rgba(196,153,42,0.06)',
              border: '1px solid rgba(196,153,42,0.12)',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#c4992a' }}>
                Recomendado para 1 a 10 tarjetas
              </span>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', paddingRight: '16px',
            color: 'var(--text-2)', fontSize: '18px',
          }}>
            {'\u203A'}
          </div>
        </button>

        {/* Option 2: Archivo de Garmin */}
        <button
          onClick={() => onSelect('garmin_zip')}
          style={{
            display: 'flex', alignItems: 'stretch',
            background: 'var(--bg-surface, #0e1c2f)',
            border: '1px solid rgba(34,197,94,0.2)',
            borderRadius: '16px', cursor: 'pointer',
            textAlign: 'left', color: 'var(--text)',
            minHeight: CARD_HEIGHT, overflow: 'hidden',
            transition: 'transform 0.2s, border-color 0.2s, box-shadow 0.2s',
            animation: 'selectorFadeIn 0.5s ease-out 0.2s both',
            padding: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.01)'
            e.currentTarget.style.borderColor = 'rgba(34,197,94,0.45)'
            e.currentTarget.style.boxShadow = '0 4px 20px rgba(34,197,94,0.08)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.borderColor = 'rgba(34,197,94,0.2)'
            e.currentTarget.style.boxShadow = 'none'
          }}
        >
          <div style={{
            width: '56px', minWidth: '56px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(34,197,94,0.06)',
            borderRight: '1px solid rgba(34,197,94,0.1)',
            color: '#22c55e',
          }}>
            <IconGarmin />
          </div>

          <div style={{ flex: 1, padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
              <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>
                Archivo de Garmin
              </span>
              <span style={{
                fontSize: '10px', fontWeight: 600, color: '#22c55e',
                letterSpacing: '0.04em',
              }}>
                100% precision
              </span>
            </div>
            <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.4 }}>
              Descarga tu historial completo desde Garmin
            </p>
            <div style={{
              padding: '8px 12px', borderRadius: '10px',
              background: 'rgba(34,197,94,0.05)',
              border: '1px solid rgba(34,197,94,0.1)',
            }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#22c55e' }}>
                Recomendado para +10 tarjetas y experiencia Pro con tAIger+
              </span>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', paddingRight: '16px',
            color: 'var(--text-2)', fontSize: '18px',
          }}>
            {'\u203A'}
          </div>
        </button>

        {/* Option 3: Escribir manual — smaller, subtler */}
        <button
          onClick={() => router.push('/perfil/historial?add=true')}
          style={{
            display: 'flex', alignItems: 'stretch',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '14px', cursor: 'pointer',
            textAlign: 'left', color: 'var(--text)',
            minHeight: '72px', overflow: 'hidden',
            transition: 'transform 0.2s, background 0.2s',
            animation: 'selectorFadeIn 0.5s ease-out 0.28s both',
            padding: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.01)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.04)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
          }}
        >
          <div style={{
            width: '48px', minWidth: '48px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--text-2)',
          }}>
            <IconPlus />
          </div>

          <div style={{ flex: 1, padding: '14px 14px 14px 0', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-2)' }}>
                Agregar ronda manual
              </span>
              <span style={{ fontSize: '10px', color: 'var(--text-2)', opacity: 0.6 }}>
                Una por una
              </span>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', paddingRight: '14px',
            color: 'var(--text-2)', fontSize: '16px', opacity: 0.5,
          }}>
            {'\u203A'}
          </div>
        </button>

      </div>
    </div>
  )
}
