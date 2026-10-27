'use client'

import type { ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import type { ImportSource } from './ImportWizard'

interface StepSelectorProps {
  onSelect: (source: ImportSource) => void
  recommendation?: 'photos' | 'garmin_zip' | null
}

const ClockIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ flexShrink: 0 }}>
    <circle cx="12" cy="12" r="10"/>
    <polyline points="12,6 12,12 16,14"/>
  </svg>
)

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

const PHOTOS_CARD = {
  icon: <IconScorecard />,
  title: 'Pantallazo de scorecard',
  badge: 'Altísima precisión',
  description: 'Toma un pantallazo de cada tarjeta en Garmin Golf',
  chip: 'Recomendado para 1 a 10 tarjetas',
  time: '~5 seg por tarjeta',
}

const GARMIN_CARD = {
  icon: <IconGarmin />,
  title: 'Archivo de Garmin',
  badge: '100% precisión',
  description: 'Descarga tu historial completo desde Garmin',
  chip: 'Recomendado para +10 tarjetas y experiencia Pro con tAIger+',
  time: '<30 seg para +100 rondas',
}

const RecomendadoLabel = () => (
  <span style={{
    fontSize: '10px', fontWeight: 700, color: 'var(--brand-on-bg)',
    letterSpacing: '0.08em', textTransform: 'uppercase',
    animation: 'selectorFadeIn 0.4s ease-out 0.12s both',
  }}>
    RECOMENDADO PARA TI
  </span>
)

interface SourceCardProps {
  icon: ReactNode
  title: string
  badge: string
  description: string
  chip: string
  time: string
  recommended: boolean
  delay: number
  onClick: () => void
}

/**
 * Tarjeta de fuente de importación (fotos o Garmin). Las dos usan el acento de
 * marca: el verde está reservado para "en vivo / éxito" (DESIGN.md §3), y
 * pintar solo Garmin de verde lo hacía leer como la opción "correcta".
 */
function SourceCard({ icon, title, badge, description, chip, time, recommended, delay, onClick }: SourceCardProps) {
  const restBorder = recommended ? 'rgba(196,153,42,0.5)' : 'rgba(196,153,42,0.25)'
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'stretch',
        background: 'var(--bg-surface)',
        border: `1px solid ${restBorder}`,
        borderRadius: '16px', cursor: 'pointer',
        textAlign: 'left', color: 'var(--text)',
        minHeight: CARD_HEIGHT, overflow: 'hidden',
        transition: 'transform 0.2s, border-color 0.2s, box-shadow 0.2s',
        animation: recommended
          ? `selectorFadeIn 0.5s ease-out ${delay}s both, recommendedPulse 3s ease-in-out 1s infinite`
          : `selectorFadeIn 0.5s ease-out ${delay}s both`,
        padding: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'scale(1.01)'
        e.currentTarget.style.borderColor = recommended ? 'rgba(196,153,42,0.7)' : 'rgba(196,153,42,0.5)'
        e.currentTarget.style.boxShadow = '0 4px 20px rgba(196,153,42,0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'scale(1)'
        e.currentTarget.style.borderColor = restBorder
        e.currentTarget.style.boxShadow = 'none'
      }}
    >
      <div style={{
        width: '56px', minWidth: '56px',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(196,153,42,0.08)',
        borderRight: '1px solid rgba(196,153,42,0.1)',
        color: 'var(--brand-on-bg)',
      }}>
        {icon}
      </div>
      <div style={{ flex: 1, padding: '16px 16px 14px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '4px' }}>
          <span style={{ fontWeight: 700, fontSize: '16px', color: 'var(--text)' }}>
            {title}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 600, color: 'var(--brand-on-bg)', letterSpacing: '0.04em' }}>
            {badge}
          </span>
        </div>
        <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: '0 0 10px', lineHeight: 1.4 }}>
          {description}
        </p>
        <div style={{
          padding: '8px 12px', borderRadius: '10px',
          background: 'rgba(196,153,42,0.06)',
          border: '1px solid rgba(196,153,42,0.12)',
          marginBottom: '6px',
        }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--brand-on-bg)' }}>
            {chip}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-3)' }}>
          <ClockIcon />
          <span style={{ fontSize: '11px' }}>{time}</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', paddingRight: '16px', color: 'var(--text-2)', fontSize: '18px' }}>
        {'\u203A'}
      </div>
    </button>
  )
}

export default function StepSelector({ onSelect, recommendation }: StepSelectorProps) {
  const router = useRouter()

  const isPhotosRecommended = recommendation === 'photos'
  const isGarminRecommended = recommendation === 'garmin_zip'
  const hasRecommendation = recommendation != null

  return (
    <div style={{ paddingTop: '24px' }}>
      <style>{`
        @keyframes selectorFadeIn {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes recommendedPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(196,153,42,0.3); }
          50%      { box-shadow: 0 0 16px 2px rgba(196,153,42,0.15); }
        }
      `}</style>

      <h1 style={{
        fontFamily: "var(--font-playfair, 'Playfair Display', serif)",
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
        Más rondas = mejor análisis. tAIger+ aprende de cada tarjeta.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>

        {/* Recommendation banner */}
        {hasRecommendation && (
          <p style={{
            fontSize: '13px',
            color: 'var(--text-2)',
            marginBottom: '4px',
            animation: 'selectorFadeIn 0.4s ease-out 0.1s both',
          }}>
            Basado en tus respuestas, te recomendamos:
          </p>
        )}

        {/* Recomendada primero (si hay recomendación) */}
        {isGarminRecommended ? (
          <>
            <RecomendadoLabel />
            <SourceCard {...GARMIN_CARD} recommended onClick={() => onSelect('garmin_zip')} delay={0.14} />
          </>
        ) : (
          <>
            {isPhotosRecommended && <RecomendadoLabel />}
            <SourceCard {...PHOTOS_CARD} recommended={isPhotosRecommended} onClick={() => onSelect('photos')} delay={isPhotosRecommended ? 0.14 : 0.12} />
          </>
        )}

        {/* Divider when there's a recommendation */}
        {hasRecommendation && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: '12px',
            margin: '8px 0 4px',
            animation: 'selectorFadeIn 0.5s ease-out 0.22s both',
          }}>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
            <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>Otras opciones</span>
            <div style={{ flex: 1, height: '1px', background: 'var(--border)' }} />
          </div>
        )}

        {/* La otra opción */}
        {isGarminRecommended ? (
          <SourceCard {...PHOTOS_CARD} recommended={false} onClick={() => onSelect('photos')} delay={0.26} />
        ) : (
          <SourceCard {...GARMIN_CARD} recommended={false} onClick={() => onSelect('garmin_zip')} delay={0.2} />
        )}

        {/* Option 3: Escribir manual — smaller, subtler */}
        <button
          onClick={() => router.push('/perfil/historial?add=true')}
          style={{
            display: 'flex', alignItems: 'stretch',
            background: 'var(--surface-soft)',
            border: '1px solid var(--border)',
            borderRadius: '14px', cursor: 'pointer',
            textAlign: 'left', color: 'var(--text)',
            minHeight: '72px', overflow: 'hidden',
            transition: 'transform 0.2s, background 0.2s',
            animation: 'selectorFadeIn 0.5s ease-out 0.28s both',
            padding: 0,
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.01)'
            e.currentTarget.style.background = 'var(--surface-soft)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.background = 'var(--surface-soft)'
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '2px' }}>
              <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-2)' }}>
                Agregar ronda manual
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-2)' }}>
                Una por una
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '5px', color: 'var(--text-2)' }}>
              <ClockIcon />
              <span style={{ fontSize: '11px' }}>~1 min por tarjeta</span>
            </div>
          </div>

          <div style={{
            display: 'flex', alignItems: 'center', paddingRight: '14px',
            color: 'var(--text-2)', fontSize: '16px',
          }}>
            {'\u203A'}
          </div>
        </button>

      </div>
    </div>
  )
}
