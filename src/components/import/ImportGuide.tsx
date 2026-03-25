'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface ImportGuideProps {
  source: 'photos' | 'csv'
  onFilesSelected: (files: FileList) => void
  onBack: () => void
  uploading: boolean
  error: string | null
}

interface GuideStep {
  number: number
  icon: string
  text: string
}

const PHOTO_STEPS: GuideStep[] = [
  { number: 1, icon: '\uD83D\uDCF1', text: 'Abre Garmin Golf en tu celular' },
  { number: 2, icon: '\uD83D\uDCCB', text: "Ve a 'Activity' o entra a una ronda" },
  { number: 3, icon: '\uD83D\uDCF7', text: 'Toma un pantallazo (captura de pantalla)' },
]

const CSV_STEPS: GuideStep[] = [
  { number: 1, icon: '\uD83D\uDCBB', text: 'Abre connect.garmin.com en tu PC' },
  { number: 2, icon: '\uD83D\uDD0D', text: "Ve a 'Actividades' y filtra por Golf" },
  { number: 3, icon: '\u2B07\uFE0F', text: 'Descarga como CSV' },
]

export default function ImportGuide({
  source,
  onFilesSelected,
  onBack,
  uploading,
  error,
}: ImportGuideProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const [stepsVisible, setStepsVisible] = useState([false, false, false])

  const steps = source === 'photos' ? PHOTO_STEPS : CSV_STEPS
  const acceptTypes = source === 'photos' ? '.jpg,.jpeg,.png,.heic' : '.csv,.xlsx'
  const isMultiple = source === 'photos'

  // Staggered step reveal
  useEffect(() => {
    const timers = [
      setTimeout(() => setStepsVisible(prev => { const n = [...prev]; n[0] = true; return n }), 100),
      setTimeout(() => setStepsVisible(prev => { const n = [...prev]; n[1] = true; return n }), 500),
      setTimeout(() => setStepsVisible(prev => { const n = [...prev]; n[2] = true; return n }), 900),
    ]
    return () => timers.forEach(clearTimeout)
  }, [])

  const handleFileChange = useCallback(
    (files: FileList | null) => {
      if (!files || files.length === 0) return
      onFilesSelected(files)
    },
    [onFilesSelected],
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setDragOver(false)
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        handleFileChange(e.dataTransfer.files)
      }
    },
    [handleFileChange],
  )

  return (
    <div style={{ paddingTop: '16px' }}>
      <style>{`
        @keyframes guideFadeSlideUp {
          from { opacity: 0; transform: translateY(18px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes guideDropZonePulse {
          0%, 100% { border-color: rgba(196,153,42,0.3); }
          50%      { border-color: rgba(196,153,42,0.6); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {/* Header with back */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '28px',
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
          <h2 style={{ fontSize: '20px', fontWeight: 700, color: 'var(--text)', margin: 0, fontFamily: 'var(--font-playfair)' }}>
            {source === 'photos' ? '\uD83D\uDCF8 Pantallazos de Garmin' : '\uD83D\uDCBB Archivo de Garmin Connect'}
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0 }}>
            {source === 'photos' ? 'Sube capturas y la IA las procesa' : 'Importa tu historial completo desde el CSV'}
          </p>
        </div>
      </div>

      {/* Animated guide steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
        {steps.map((step, i) => (
          <div
            key={step.number}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '14px',
              padding: '14px 16px',
              background: 'rgba(255,255,255,0.03)',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px',
              opacity: stepsVisible[i] ? 1 : 0,
              transform: stepsVisible[i] ? 'translateY(0)' : 'translateY(18px)',
              transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
            }}
          >
            {/* Number circle */}
            <span
              style={{
                width: '32px',
                height: '32px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'linear-gradient(135deg, #c4992a, #e8c06a)',
                color: '#070d18',
                borderRadius: '50%',
                fontSize: '14px',
                fontWeight: 700,
                flexShrink: 0,
              }}
            >
              {step.number}
            </span>

            {/* Icon */}
            <span style={{ fontSize: '28px', flexShrink: 0, width: '48px', textAlign: 'center' }}>
              {step.icon}
            </span>

            {/* Text */}
            <span style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 500, lineHeight: 1.4 }}>
              {step.text}
            </span>
          </div>
        ))}
      </div>

      {/* Tip box */}
      <div
        style={{
          padding: '12px 16px',
          background: 'rgba(196,153,42,0.06)',
          border: '1px solid rgba(196,153,42,0.15)',
          borderRadius: '12px',
          marginBottom: '28px',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start',
        }}
      >
        <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>
          {'\uD83D\uDCA1'}
        </span>
        <div>
          {source === 'photos' ? (
            <span style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.5 }}>
              Puedes mezclar pantallazos de actividades y scorecards. La IA detecta el formato automaticamente.
            </span>
          ) : (
            <>
              <span style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.5, display: 'block' }}>
                Recomendamos hacer esto desde el computador para mayor comodidad.
              </span>
              <a
                href="https://connect.garmin.com/modern/activities"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  color: '#c4992a',
                  fontSize: '13px',
                  textDecoration: 'underline',
                  textUnderlineOffset: '3px',
                  marginTop: '6px',
                  display: 'inline-block',
                }}
              >
                connect.garmin.com/modern/activities
              </a>
            </>
          )}
        </div>
      </div>

      {/* Drop zone */}
      <input
        ref={fileInputRef}
        type="file"
        accept={acceptTypes}
        multiple={isMultiple}
        onChange={e => handleFileChange(e.target.files)}
        style={{ display: 'none' }}
      />

      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
        role="button"
        tabIndex={0}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click() }}
        style={{
          width: '100%',
          padding: '36px 20px',
          borderRadius: '16px',
          border: dragOver
            ? '2px solid #c4992a'
            : '2px dashed rgba(196,153,42,0.3)',
          background: dragOver
            ? 'rgba(196,153,42,0.08)'
            : uploading
              ? 'rgba(196,153,42,0.04)'
              : 'rgba(255,255,255,0.02)',
          cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          transition: 'all 0.25s ease',
          animation: uploading ? 'none' : 'guideDropZonePulse 3s ease-in-out infinite',
          marginBottom: '16px',
          minHeight: '44px',
        }}
      >
        {uploading ? (
          <>
            <div
              style={{
                width: '36px',
                height: '36px',
                border: '3px solid rgba(196,153,42,0.2)',
                borderTopColor: '#c4992a',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ color: 'var(--text-2)', fontSize: '14px' }}>
              {source === 'photos' ? 'Subiendo fotos...' : 'Procesando archivo...'}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '36px' }}>
              {source === 'photos' ? '\uD83D\uDCF8' : '\uD83D\uDCC4'}
            </span>
            <span style={{ color: 'var(--text-2)', fontSize: '14px', textAlign: 'center' }}>
              Arrastra tu archivo aqui o toca para seleccionar
            </span>
            <span style={{ color: 'var(--text-3, #5a6a7d)', fontSize: '12px' }}>
              {source === 'photos' ? 'JPG, PNG o HEIC — hasta 20 fotos' : 'CSV o XLSX'}
            </span>
          </>
        )}
      </div>

      {/* Select file button */}
      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{
          width: '100%',
          padding: '16px',
          borderRadius: '14px',
          fontSize: '16px',
          fontWeight: 700,
          background: uploading ? 'rgba(196,153,42,0.3)' : 'linear-gradient(135deg, #c4992a, #e8c06a)',
          color: uploading ? 'rgba(255,255,255,0.5)' : '#070d18',
          border: 'none',
          cursor: uploading ? 'not-allowed' : 'pointer',
          minHeight: '52px',
          transition: 'all 0.2s ease',
        }}
      >
        {uploading ? 'Procesando...' : 'Seleccionar archivo'}
      </button>

      {error && (
        <p
          style={{
            color: '#ff6666',
            fontSize: '13px',
            marginTop: '12px',
            textAlign: 'center',
          }}
        >
          {error}
        </p>
      )}
    </div>
  )
}
