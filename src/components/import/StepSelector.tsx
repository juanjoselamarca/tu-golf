'use client'

import { useRouter } from 'next/navigation'
import type { ImportSource } from './ImportWizard'

interface StepSelectorProps {
  onSelect: (source: ImportSource) => void
}

export default function StepSelector({ onSelect }: StepSelectorProps) {
  const router = useRouter()

  return (
    <div style={{ paddingTop: '32px' }}>
      <style>{`
        @keyframes selectorFadeIn {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes cameraPulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.12); }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-12px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>

      <h1
        style={{
          fontSize: '24px',
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: '8px',
          fontFamily: 'var(--font-playfair)',
          animation: 'selectorFadeIn 0.4s ease-out both',
        }}
      >
        Elige como subir
      </h1>
      <p
        style={{
          color: 'var(--text-2)',
          fontSize: '15px',
          marginBottom: '32px',
          animation: 'selectorFadeIn 0.4s ease-out 0.1s both',
        }}
      >
        Importa tu historial de golf en segundos
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '12px',
        }}
        className="selector-grid"
      >
        {/* Option A: Foto de tarjeta — MOST PROMINENT */}
        <button
          onClick={() => onSelect('photos')}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '20px',
            background: 'rgba(196,153,42,0.06)',
            border: '2px solid rgba(196,153,42,0.4)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '120px',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.15s both',
            overflow: 'visible',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.02)'
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(196,153,42,0.15)'
            e.currentTarget.style.borderColor = 'rgba(196,153,42,0.6)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.borderColor = 'rgba(196,153,42,0.4)'
          }}
        >
          {/* Gold badge */}
          <span
            style={{
              position: 'absolute',
              top: '-10px',
              right: '16px',
              padding: '4px 12px',
              background: 'linear-gradient(135deg, #c4992a, #e8c06a)',
              color: '#070d18',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
            }}
          >
            La mas facil
          </span>

          <span
            style={{
              fontSize: '36px',
              width: '64px',
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(196,153,42,0.12)',
              borderRadius: '16px',
              flexShrink: 0,
              animation: 'cameraPulse 2.5s ease-in-out infinite',
            }}
          >
            {'\uD83D\uDCF8'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: '17px', marginBottom: '4px', color: 'var(--text)' }}>
              Foto de tarjeta
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.4 }}>
              Toma una foto de tu tarjeta y listo
            </div>
          </div>
          <span
            style={{
              color: '#c4992a',
              fontSize: '20px',
              flexShrink: 0,
              fontWeight: 700,
            }}
          >
            &rsaquo;
          </span>
        </button>

        {/* Option B: Archivo CSV */}
        <button
          onClick={() => onSelect('csv')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '120px',
            transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
            animation: 'slideInLeft 0.5s ease-out 0.3s both',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.02)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
        >
          <span
            style={{
              fontSize: '36px',
              width: '64px',
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '16px',
              flexShrink: 0,
              animation: 'slideInLeft 0.6s ease-out 0.4s both',
            }}
          >
            {'\uD83D\uDCC4'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px', color: 'var(--text)' }}>
              Archivo CSV
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.4 }}>
              Desde 18Birdies, GolfGameBook u otra app
            </div>
          </div>
          <span
            style={{
              color: 'var(--text-2)',
              fontSize: '20px',
              flexShrink: 0,
            }}
          >
            &rsaquo;
          </span>
        </button>

        {/* Option C: Escribir manual */}
        <button
          onClick={() => router.push('/perfil/historial')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '120px',
            transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
            animation: 'slideInLeft 0.5s ease-out 0.45s both',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.02)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'
          }}
        >
          <span
            style={{
              fontSize: '36px',
              width: '64px',
              height: '64px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.05)',
              borderRadius: '16px',
              flexShrink: 0,
            }}
          >
            {'\u270F\uFE0F'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px', color: 'var(--text)' }}>
              Escribir manual
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.4 }}>
              Agrega una ronda a la vez
            </div>
          </div>
          <span
            style={{
              color: 'var(--text-2)',
              fontSize: '20px',
              flexShrink: 0,
            }}
          >
            &rsaquo;
          </span>
        </button>
      </div>
    </div>
  )
}
