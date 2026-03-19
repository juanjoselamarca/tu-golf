'use client'

import type { ImportSource } from './ImportWizard'

interface StepSelectorProps {
  onSelect: (source: ImportSource) => void
}

const OPTIONS: { key: ImportSource; icon: string; title: string; desc: string }[] = [
  {
    key: 'garmin',
    icon: '\u231A',
    title: 'Garmin Golf',
    desc: 'Importa desde tu reloj Garmin',
  },
  {
    key: 'photos',
    icon: '\uD83D\uDCF7',
    title: 'Fotos de scorecard',
    desc: 'Sube fotos y las leemos con IA',
  },
  {
    key: 'csv',
    icon: '\uD83D\uDCC4',
    title: 'Archivo CSV / Excel',
    desc: 'Exporta desde tu app de golf',
  },
]

export default function StepSelector({ onSelect }: StepSelectorProps) {
  return (
    <div style={{ paddingTop: '32px' }}>
      <h1
        style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#edeae4',
          marginBottom: '8px',
          fontFamily: '"Playfair Display", serif',
        }}
      >
        Importar rondas
      </h1>
      <p style={{ color: '#94a8c0', fontSize: '15px', marginBottom: '32px' }}>
        Elige como quieres traer tu historial de golf
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {OPTIONS.map(opt => (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              padding: '20px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              cursor: 'pointer',
              textAlign: 'left',
              color: '#edeae4',
              minHeight: '44px',
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(196,153,42,0.08)'
              e.currentTarget.style.borderColor = 'rgba(196,153,42,0.3)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(255,255,255,0.03)'
              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
            }}
          >
            <span
              style={{
                fontSize: '32px',
                width: '56px',
                height: '56px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(196,153,42,0.1)',
                borderRadius: '14px',
                flexShrink: 0,
              }}
            >
              {opt.icon}
            </span>
            <div>
              <div style={{ fontWeight: 600, fontSize: '16px', marginBottom: '4px' }}>
                {opt.title}
              </div>
              <div style={{ color: '#94a8c0', fontSize: '13px' }}>{opt.desc}</div>
            </div>
            <span
              style={{
                marginLeft: 'auto',
                color: '#94a8c0',
                fontSize: '18px',
                flexShrink: 0,
              }}
            >
              &rsaquo;
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
