'use client'

import type { ImportState } from './ImportWizard'

interface InstructionProps {
  onBack: () => void
  onFileReady?: () => void
  onFilesReady?: () => void
  onStateUpdate: (partial: Partial<ImportState>) => void
  state: ImportState
}

const STEPS = [
  'Abre la app Garmin Golf en tu telefono',
  'Ve a Configuracion > Exportar datos',
  'Selecciona "Exportar historial completo"',
  'Descarga el archivo .zip que te envia por email',
]

export default function StepGarminInstructions({
  onBack,
}: InstructionProps) {
  return (
    <div style={{ paddingTop: '16px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '24px',
        }}
      >
        <button
          onClick={onBack}
          style={{
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            color: 'var(--text-2)',
            fontSize: '18px',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          &larr;
        </button>
        <div>
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 700,
              color: 'var(--text)',
              margin: 0,
            }}
          >
            {'\u231A'} Importar desde Garmin
          </h2>
        </div>
      </div>

      {/* Steps */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          marginBottom: '32px',
        }}
      >
        {STEPS.map((step, i) => (
          <div
            key={i}
            style={{
              display: 'flex',
              gap: '14px',
              alignItems: 'flex-start',
            }}
          >
            <div
              style={{
                width: '28px',
                height: '28px',
                borderRadius: '50%',
                background: 'rgba(196,153,42,0.15)',
                color: '#c4992a',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '13px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {i + 1}
            </div>
            <p
              style={{
                color: 'var(--text)',
                fontSize: '14px',
                lineHeight: 1.5,
                margin: 0,
                paddingTop: '3px',
              }}
            >
              {step}
            </p>
          </div>
        ))}
      </div>

      {/* Coming soon notice */}
      <div
        style={{
          background: 'rgba(196,153,42,0.08)',
          border: '1px solid rgba(196,153,42,0.2)',
          borderRadius: '14px',
          padding: '20px',
          textAlign: 'center',
          marginBottom: '24px',
        }}
      >
        <p
          style={{
            color: '#c4992a',
            fontWeight: 600,
            fontSize: '15px',
            marginBottom: '8px',
          }}
        >
          Proximamente
        </p>
        <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0 }}>
          La importacion directa desde archivos Garmin FIT esta en desarrollo.
          Mientras tanto, exporta tus datos como CSV desde Garmin Connect.
        </p>
      </div>

      {/* Privacy */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: '10px',
          padding: '14px',
          background: 'rgba(255,255,255,0.02)',
          borderRadius: '12px',
        }}
      >
        <span style={{ fontSize: '14px', flexShrink: 0 }}>{'\uD83D\uDD12'}</span>
        <p
          style={{
            color: '#5a6a7d',
            fontSize: '12px',
            lineHeight: 1.5,
            margin: 0,
          }}
        >
          Tus datos se procesan de forma segura y nunca se comparten con
          terceros. Solo extraemos scores, fechas y nombres de campo.
        </p>
      </div>
    </div>
  )
}
