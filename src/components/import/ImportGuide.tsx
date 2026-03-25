'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface ImportGuideProps {
  source: 'photos' | 'csv' | 'garmin_zip'
  onFilesSelected: (files: FileList) => void
  onBack: () => void
  uploading: boolean
  error: string | null
}

interface GuideStep {
  number: number
  icon: string
  text: string
  subtitle?: string
}

const PHOTO_STEPS: GuideStep[] = [
  { number: 1, icon: '\uD83D\uDCF1', text: 'Abre Garmin Golf en tu celular', subtitle: undefined },
  { number: 2, icon: '\u26F3', text: 'Entra a una ronda y busca la Scorecard', subtitle: undefined },
  { number: 3, icon: '\uD83D\uDCF8', text: 'Toma un pantallazo (captura de pantalla)', subtitle: undefined },
]

const CSV_STEPS: GuideStep[] = [
  { number: 1, icon: '\uD83D\uDCBB', text: 'Abre connect.garmin.com en tu PC' },
  { number: 2, icon: '\uD83D\uDD0D', text: "Ve a 'Actividades' y filtra por Golf" },
  { number: 3, icon: '\u2B07\uFE0F', text: 'Descarga como CSV' },
]

interface GarminZipStep {
  number: number
  title: string
  description: string
  link?: { url: string; label: string }
}

const GARMIN_ZIP_STEPS: GarminZipStep[] = [
  {
    number: 1,
    title: 'Inicia sesion en tu cuenta Garmin',
    description: '',
    link: { url: 'https://www.garmin.com/account', label: 'garmin.com/account' },
  },
  {
    number: 2,
    title: "Busca 'Gestionar datos' o 'Data Management'",
    description: 'Esta en la seccion de privacidad de tu cuenta',
  },
  {
    number: 3,
    title: "Solicita 'Exportar datos' o 'Request Data Export'",
    description: 'Garmin preparara un archivo con tu informacion',
  },
  {
    number: 4,
    title: 'Descarga el archivo ZIP cuando te llegue el email',
    description: 'Te llegara un correo en 24 a 48 horas',
  },
]

const TITLES: Record<string, { title: string; subtitle: string }> = {
  photos: { title: '\uD83D\uDCF8 Pantallazo de scorecard', subtitle: 'La IA lee los numeros exactos de cada hoyo' },
  csv: { title: '\uD83D\uDCBB Archivo de Garmin Connect', subtitle: 'Importa tu historial completo desde el CSV' },
  garmin_zip: { title: '\uD83D\uDCE6 Archivo de Garmin', subtitle: 'Todas tus rondas de una sola vez, con datos completos' },
}

export default function ImportGuide({
  source,
  onFilesSelected,
  onBack,
  uploading,
  error,
}: ImportGuideProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)
  const isGarminZip = source === 'garmin_zip'
  const isPhotos = source === 'photos'
  const stepCount = isGarminZip ? GARMIN_ZIP_STEPS.length : 3
  const [stepsVisible, setStepsVisible] = useState<boolean[]>(Array(stepCount).fill(false))

  const steps = source === 'photos' ? PHOTO_STEPS : CSV_STEPS
  const acceptTypes = source === 'garmin_zip' ? '.zip' : source === 'csv' ? '.csv,.xlsx' : '.jpg,.jpeg,.png,.heic'
  const isMultiple = source === 'photos'

  // Staggered step reveal
  useEffect(() => {
    const count = isGarminZip ? GARMIN_ZIP_STEPS.length : 3
    const timers = Array.from({ length: count }, (_, i) =>
      setTimeout(() => setStepsVisible(prev => {
        const n = [...prev]
        n[i] = true
        return n
      }), 100 + i * 200)
    )
    return () => timers.forEach(clearTimeout)
  }, [isGarminZip])

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

  const titleInfo = TITLES[source] || TITLES.photos

  // Garmin ZIP guide — premium step-by-step
  if (isGarminZip) {
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
              {titleInfo.title}
            </h2>
            <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0 }}>
              {titleInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Phase 1: Solicitar tus datos */}
        <div
          style={{
            padding: '16px',
            background: 'rgba(196,153,42,0.04)',
            border: '1px solid rgba(196,153,42,0.15)',
            borderRadius: '14px',
            marginBottom: '12px',
          }}
        >
          <h3 style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#c4992a',
            margin: '0 0 4px 0',
          }}>
            Paso unico: solicitar tus datos
          </h3>
          <p style={{ color: 'var(--text-2)', fontSize: '12px', margin: 0, opacity: 0.8 }}>
            Solo necesitas hacer esto una vez. Toma 24 a 48 horas.
          </p>
        </div>

        {/* Animated Garmin ZIP steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '24px' }}>
          {GARMIN_ZIP_STEPS.map((step, i) => (
            <div
              key={step.number}
              style={{
                display: 'flex',
                gap: '14px',
                padding: '16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                opacity: stepsVisible[i] ? 1 : 0,
                transform: stepsVisible[i] ? 'translateY(0)' : 'translateY(18px)',
                transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
              }}
            >
              {/* Number circle — gold */}
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
                  marginTop: '2px',
                }}
              >
                {step.number}
              </span>

              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600, lineHeight: 1.4, marginBottom: step.description ? '4px' : 0 }}>
                  {step.title}
                </div>
                {step.description && (
                  <div style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.5 }}>
                    {step.description}
                  </div>
                )}
                {step.link && (
                  <a
                    href={step.link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-block',
                      marginTop: '8px',
                      color: '#c4992a',
                      fontSize: '13px',
                      fontWeight: 600,
                      textDecoration: 'underline',
                      textUnderlineOffset: '3px',
                    }}
                  >
                    {step.link.label} &rarr;
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div style={{ height: '1px', background: 'rgba(255,255,255,0.06)', margin: '0 0 24px 0' }} />

        {/* Phase 2: Subir el archivo */}
        <div
          style={{
            padding: '16px',
            background: 'rgba(196,153,42,0.04)',
            border: '1px solid rgba(196,153,42,0.15)',
            borderRadius: '14px',
            marginBottom: '16px',
          }}
        >
          <h3 style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#c4992a',
            margin: 0,
          }}>
            Subir el archivo
          </h3>
        </div>

        {/* Drop zone for ZIP */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".zip"
          multiple={false}
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
                Procesando archivo ZIP...
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '36px' }}>
                {'\uD83D\uDCE6'}
              </span>
              <span style={{ color: 'var(--text-2)', fontSize: '14px', textAlign: 'center' }}>
                Arrastra tu archivo ZIP de Garmin aqui
              </span>
              <span style={{ color: 'var(--text-3, #5a6a7d)', fontSize: '12px' }}>
                Archivo .zip sin descomprimir
              </span>
            </>
          )}
        </div>

        {/* Gold button */}
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
          {uploading ? 'Procesando...' : 'Seleccionar archivo ZIP'}
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

        {/* Trust note */}
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(255,255,255,0.02)',
            border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: '12px',
            marginTop: '20px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: '14px', flexShrink: 0, marginTop: '1px' }}>
            {'\uD83D\uDD12'}
          </span>
          <span style={{ color: 'var(--text-2)', fontSize: '12px', lineHeight: 1.5, opacity: 0.8 }}>
            Garmin te envia un archivo con toda tu data. Nosotros solo leemos tus scores de golf, putts y fairways. Nada mas se almacena.
          </span>
        </div>
      </div>
    )
  }

  // Photos guide — premium step-by-step
  if (isPhotos) {
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
              {titleInfo.title}
            </h2>
            <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0 }}>
              {titleInfo.subtitle}
            </p>
          </div>
        </div>

        {/* Animated guide steps */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '16px' }}>
          {PHOTO_STEPS.map((step, i) => (
            <div
              key={step.number}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                padding: '16px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.06)',
                borderRadius: '14px',
                opacity: stepsVisible[i] ? 1 : 0,
                transform: stepsVisible[i] ? 'translateY(0)' : 'translateY(18px)',
                transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
              }}
            >
              {/* Number circle — gold */}
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
              <span style={{ fontSize: '28px', flexShrink: 0, width: '36px', textAlign: 'center' }}>
                {step.icon}
              </span>

              {/* Text */}
              <span style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600, lineHeight: 1.4 }}>
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
          <div style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.6 }}>
            Asegurate de que se vean todos los scores y el nombre del club.
            <br />
            <span style={{ opacity: 0.7 }}>
              Para mas de 10 tarjetas, te recomendamos usar el archivo de Garmin — es mas rapido.
            </span>
          </div>
        </div>

        {/* Drop zone */}
        <input
          ref={fileInputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.heic"
          multiple
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
                Subiendo fotos...
              </span>
            </>
          ) : (
            <>
              <span style={{ fontSize: '36px' }}>
                {'\uD83D\uDCF8'}
              </span>
              <span style={{ color: 'var(--text-2)', fontSize: '14px', textAlign: 'center' }}>
                Arrastra tus pantallazos aqui o toca para seleccionar
              </span>
              <span style={{ color: 'var(--text-3, #5a6a7d)', fontSize: '12px' }}>
                JPG, PNG o HEIC — hasta 20 fotos
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
          {uploading ? 'Procesando...' : 'Seleccionar pantallazos'}
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

  // CSV guide — minimal (hidden power-user feature)
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
            {titleInfo.title}
          </h2>
          <p style={{ color: 'var(--text-2)', fontSize: '13px', margin: 0 }}>
            {titleInfo.subtitle}
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
            <span style={{ fontSize: '28px', flexShrink: 0, width: '48px', textAlign: 'center' }}>
              {step.icon}
            </span>
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
          <span style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.5 }}>
            Recomendamos hacer esto desde el computador para mayor comodidad
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
              Procesando archivo...
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '36px' }}>
              {'\uD83D\uDCC4'}
            </span>
            <span style={{ color: 'var(--text-2)', fontSize: '14px', textAlign: 'center' }}>
              Arrastra tu archivo aqui o toca para seleccionar
            </span>
            <span style={{ color: 'var(--text-3, #5a6a7d)', fontSize: '12px' }}>
              CSV o XLSX
            </span>
          </>
        )}
      </div>

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
