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
  { number: 1, icon: '\uD83D\uDCF1', text: 'Abre la app de tu club de golf' },
  { number: 2, icon: '\uD83D\uDCCB', text: 'Busca tu tarjeta de score' },
  { number: 3, icon: '\uD83D\uDCF8', text: 'Toma una captura de pantalla' },
]

const CSV_STEPS: GuideStep[] = [
  { number: 1, icon: '\uD83D\uDCF1', text: 'Abre tu app de golf (18Birdies, GolfGameBook)' },
  { number: 2, icon: '\u2B07\uFE0F', text: 'Busca "Exportar" o "Historial"' },
  { number: 3, icon: '\uD83D\uDCC1', text: 'Descarga el archivo CSV' },
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
            {source === 'photos' ? '\uD83D\uDCF8 Foto de tarjeta' : '\uD83D\uDCC4 Archivo CSV'}
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0 }}>
            {source === 'photos' ? 'Sube una foto y la leemos con IA' : 'Importa desde tu app de golf'}
          </p>
        </div>
      </div>

      {/* Animated guide steps */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '28px' }}>
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
