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
        Importa tu historial
      </h1>
      <p
        style={{
          color: 'var(--text-2)',
          fontSize: '15px',
          marginBottom: '32px',
          animation: 'selectorFadeIn 0.4s ease-out 0.1s both',
        }}
      >
        Sube tus tarjetas de Garmin Golf y activa tu CPI y tAIger
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '16px',
        }}
      >
        {/* Option 1: Archivo de Garmin — MOST PROMINENT, GOLD BORDER */}
        <button
          onClick={() => onSelect('garmin_zip')}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '20px',
            background: 'rgba(196,153,42,0.08)',
            border: '2px solid rgba(196,153,42,0.5)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '44px',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.15s both',
            overflow: 'visible',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.02)'
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(196,153,42,0.2)'
            e.currentTarget.style.borderColor = 'rgba(196,153,42,0.7)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.boxShadow = 'none'
            e.currentTarget.style.borderColor = 'rgba(196,153,42,0.5)'
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
            100% precision
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span
              style={{
                fontSize: '32px',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(196,153,42,0.12)',
                borderRadius: '16px',
                flexShrink: 0,
              }}
            >
              {'\uD83D\uDCE6'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '17px', marginBottom: '4px', color: 'var(--text)' }}>
                Archivo de Garmin
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.5 }}>
                Importa TODAS tus rondas de una sola vez con datos completos
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '12px', lineHeight: 1.4, marginTop: '2px', opacity: 0.7 }}>
                Scores, putts, fairways, penalidades — todo directo del reloj
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
          </div>
        </button>

        {/* Option 2: Foto de scorecard */}
        <button
          onClick={() => onSelect('photos')}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '20px',
            background: 'rgba(196,153,42,0.06)',
            border: '2px solid rgba(196,153,42,0.4)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '44px',
            transition: 'transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.25s both',
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
            Mas rapida
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span
              style={{
                fontSize: '32px',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(196,153,42,0.12)',
                borderRadius: '16px',
                flexShrink: 0,
              }}
            >
              {'\uD83D\uDCF8'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '17px', marginBottom: '4px', color: 'var(--text)' }}>
                Foto de scorecard
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.5 }}>
                Toma un pantallazo de cada tarjeta en Garmin Golf
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '12px', lineHeight: 1.4, marginTop: '2px', opacity: 0.7 }}>
                La IA lee los scores exactos hoyo por hoyo
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
          </div>
        </button>

        {/* Option 3: Asistido por IA */}
        <button
          onClick={() => onSelect('assisted')}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '20px',
            background: 'rgba(96,165,250,0.04)',
            border: '1px solid rgba(96,165,250,0.25)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '44px',
            transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.35s both',
            overflow: 'visible',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.02)'
            e.currentTarget.style.background = 'rgba(96,165,250,0.08)'
            e.currentTarget.style.borderColor = 'rgba(96,165,250,0.4)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.background = 'rgba(96,165,250,0.04)'
            e.currentTarget.style.borderColor = 'rgba(96,165,250,0.25)'
          }}
        >
          {/* Blue badge */}
          <span
            style={{
              position: 'absolute',
              top: '-10px',
              right: '16px',
              padding: '4px 12px',
              background: 'rgba(96,165,250,0.15)',
              border: '1px solid rgba(96,165,250,0.3)',
              color: '#60a5fa',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '8px',
              letterSpacing: '0.3px',
              textTransform: 'uppercase',
            }}
          >
            Tu verificas
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span
              style={{
                fontSize: '32px',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(96,165,250,0.1)',
                borderRadius: '16px',
                flexShrink: 0,
              }}
            >
              {'\uD83E\uDD16'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '17px', marginBottom: '4px', color: 'var(--text)' }}>
                Asistido por IA
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.5 }}>
                La IA detecta tu ronda, tu confirmas los scores
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '12px', lineHeight: 1.4, marginTop: '2px', opacity: 0.7 }}>
                Perfecto si quieres verificar cada numero
              </div>
            </div>
            <span
              style={{
                color: '#60a5fa',
                fontSize: '20px',
                flexShrink: 0,
                fontWeight: 700,
              }}
            >
              &rsaquo;
            </span>
          </div>
        </button>

        {/* Option 4: Escribir manual — smaller, gray */}
        <button
          onClick={() => router.push('/perfil/historial')}
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: '16px',
            padding: '16px 20px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '44px',
            transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.45s both',
            overflow: 'visible',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'scale(1.02)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.05)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'scale(1)'
            e.currentTarget.style.background = 'rgba(255,255,255,0.02)'
            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)'
          }}
        >
          {/* Gray badge */}
          <span
            style={{
              position: 'absolute',
              top: '-10px',
              right: '16px',
              padding: '4px 10px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'var(--text-2)',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '8px',
              letterSpacing: '0.3px',
            }}
          >
            Una por una
          </span>

          <span
            style={{
              fontSize: '24px',
              width: '44px',
              height: '44px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(255,255,255,0.04)',
              borderRadius: '12px',
              flexShrink: 0,
            }}
          >
            {'\u270F\uFE0F'}
          </span>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '15px', color: 'var(--text-2)' }}>
              Escribir manual
            </div>
            <div style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.4, opacity: 0.7 }}>
              Agrega rondas manualmente a tu historial
            </div>
          </div>
          <span
            style={{
              color: 'var(--text-2)',
              fontSize: '20px',
              flexShrink: 0,
              opacity: 0.5,
            }}
          >
            &rsaquo;
          </span>
        </button>
      </div>
    </div>
  )
}
