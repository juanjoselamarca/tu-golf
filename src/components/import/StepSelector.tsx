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
          gap: '12px',
        }}
      >
        {/* Option 1: Pantallazos de actividades — MOST PROMINENT */}
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
            minHeight: '100px',
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
            Mas rapido
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
              {'\uD83D\uDCF1\uD83D\uDCCB'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '17px', marginBottom: '4px', color: 'var(--text)' }}>
                Pantallazos de actividades
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.4 }}>
                Sube fotos de tu lista de actividades en Garmin Golf. Leemos hasta 5 rondas por foto.
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

          {/* Preview image */}
          <img
            src="/import-guide/garmin-activity.jpeg"
            alt="Ejemplo Garmin actividades"
            style={{
              width: '100%',
              maxHeight: '100px',
              borderRadius: '12px',
              objectFit: 'cover',
              opacity: 0.8,
            }}
          />

          {/* Tag */}
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-2)',
              background: 'rgba(196,153,42,0.1)',
              padding: '4px 10px',
              borderRadius: '8px',
              alignSelf: 'flex-start',
            }}
          >
            IA reconstruye tus scores automaticamente
          </span>
        </button>

        {/* Option 2: Pantallazos de scorecards */}
        <button
          onClick={() => onSelect('photos')}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '100px',
            transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.25s both',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
              {'\uD83D\uDCDD'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px', color: 'var(--text)' }}>
                Pantallazos de scorecards
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.4 }}>
                Sube la tarjeta detallada de cada ronda. Scores exactos hoyo por hoyo.
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
          </div>

          {/* Preview image */}
          <img
            src="/import-guide/garmin-scorecard.jpeg"
            alt="Ejemplo Garmin scorecard"
            style={{
              width: '100%',
              maxHeight: '100px',
              borderRadius: '12px',
              objectFit: 'cover',
              opacity: 0.8,
            }}
          />

          {/* Tag */}
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-2)',
              background: 'rgba(255,255,255,0.05)',
              padding: '4px 10px',
              borderRadius: '8px',
              alignSelf: 'flex-start',
            }}
          >
            Maxima precision
          </span>
        </button>

        {/* Option 3: Archivo de Garmin Connect */}
        <button
          onClick={() => onSelect('csv')}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '20px',
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '100px',
            transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.35s both',
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
          {/* Tag badge */}
          <span
            style={{
              position: 'absolute',
              top: '-10px',
              right: '16px',
              padding: '4px 10px',
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              color: 'var(--text-2)',
              fontSize: '11px',
              fontWeight: 600,
              borderRadius: '8px',
              letterSpacing: '0.3px',
            }}
          >
            Desde tu PC
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
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
              {'\uD83D\uDCBB'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px', color: 'var(--text)' }}>
                Archivo de Garmin Connect
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.4 }}>
                Exporta tu historial completo desde el computador.
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
          </div>

          {/* Link to Garmin Connect */}
          <a
            href="https://connect.garmin.com/modern/activities"
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              color: '#c4992a',
              fontSize: '13px',
              textDecoration: 'underline',
              textUnderlineOffset: '3px',
            }}
          >
            Ir a connect.garmin.com/modern/activities
          </a>
          <span style={{ color: 'var(--text-2)', fontSize: '12px', marginTop: '-8px' }}>
            Descarga el CSV y subelo aqui
          </span>
        </button>

        {/* Option 4: Asistido por IA — NEW */}
        <button
          onClick={() => onSelect('assisted')}
          style={{
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            padding: '20px',
            background: 'rgba(96,165,250,0.04)',
            border: '1px solid rgba(96,165,250,0.2)',
            borderRadius: '16px',
            cursor: 'pointer',
            textAlign: 'left',
            color: 'var(--text)',
            minHeight: '100px',
            transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.4s both',
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
            e.currentTarget.style.borderColor = 'rgba(96,165,250,0.2)'
          }}
        >
          {/* Badge */}
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
            100% precision
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <span
              style={{
                fontSize: '36px',
                width: '64px',
                height: '64px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(96,165,250,0.1)',
                borderRadius: '16px',
                flexShrink: 0,
              }}
            >
              {'\uD83E\uDD16\u2705'}
            </span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '17px', marginBottom: '4px', color: 'var(--text)' }}>
                Asistido por IA
              </div>
              <div style={{ color: 'var(--text-2)', fontSize: '14px', lineHeight: 1.4 }}>
                La IA detecta tus rondas, tu confirmas los scores exactos
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

          {/* Tag */}
          <span
            style={{
              fontSize: '12px',
              color: 'var(--text-2)',
              background: 'rgba(96,165,250,0.08)',
              padding: '4px 10px',
              borderRadius: '8px',
              alignSelf: 'flex-start',
            }}
          >
            IA lee club y fecha, tu escribes los scores
          </span>
        </button>

        {/* Option 5: Escribir manual */}
        <button
          onClick={() => router.push('/perfil/historial')}
          style={{
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
            minHeight: '56px',
            transition: 'transform 0.2s ease, background 0.2s ease, border-color 0.2s ease',
            animation: 'selectorFadeIn 0.5s ease-out 0.5s both',
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
              Agrega rondas una por una
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
