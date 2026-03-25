'use client'

import { useState, useRef, useCallback, useEffect } from 'react'

interface ImportGuideProps {
  source: 'photos' | 'csv' | 'assisted' | 'garmin_zip'
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
  { number: 2, icon: '\u26F3', text: 'Entra a la ronda que quieres importar' },
  { number: 3, icon: '\uD83D\uDCF8', text: 'Toma un pantallazo de la scorecard completa' },
]

const ASSISTED_STEPS: GuideStep[] = [
  { number: 1, icon: '\uD83D\uDCF1', text: 'Abre Garmin Golf en tu celular' },
  { number: 2, icon: '\uD83D\uDCF8', text: 'Toma un pantallazo de tu lista de actividades o de una scorecard' },
  { number: 3, icon: '\uD83E\uDD16', text: 'La IA detectara el club, fecha y score total' },
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
    title: 'Abre tu navegador y ve a garmin.com/account',
    description: 'Inicia sesion con tu cuenta de Garmin',
    link: { url: 'https://www.garmin.com/account', label: 'Ir a garmin.com/account' },
  },
  {
    number: 2,
    title: "Busca 'Administrar tus datos' o 'Data Management'",
    description: 'Esta en la seccion de privacidad o configuracion de tu cuenta',
  },
  {
    number: 3,
    title: "Haz click en 'Exportar tus datos' o 'Request Data Export'",
    description: 'Garmin preparara un archivo con TODA tu informacion',
  },
  {
    number: 4,
    title: 'Espera el email de Garmin (24 a 48 horas)',
    description: 'Te llegara un correo con un link para descargar un archivo ZIP',
  },
  {
    number: 5,
    title: 'Descarga el archivo ZIP',
    description: 'NO lo descomprimas. Subelo tal cual aqui',
  },
]

const TIPS: Record<string, string> = {
  photos: 'Asegurate de que se vean todos los scores y el nombre del club',
  assisted: 'Despues te pediremos que confirmes los scores hoyo por hoyo',
  csv: 'Recomendamos hacer esto desde el computador para mayor comodidad',
  garmin_zip: 'Solo necesitas hacer esto una vez. Despues puedes subir el archivo actualizado cuando quieras.',
}

const TITLES: Record<string, { title: string; subtitle: string }> = {
  photos: { title: '\uD83D\uDCF8 Foto de scorecard', subtitle: 'Sube la tarjeta y la IA lee los scores' },
  assisted: { title: '\uD83E\uDD16 Asistido por IA', subtitle: 'Sube una foto y confirma los scores' },
  csv: { title: '\uD83D\uDCBB Archivo de Garmin Connect', subtitle: 'Importa tu historial completo desde el CSV' },
  garmin_zip: { title: '\uD83D\uDCE6 Archivo de Garmin', subtitle: 'Importa TODAS tus rondas con datos completos' },
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
  const stepCount = isGarminZip ? GARMIN_ZIP_STEPS.length : 3
  const [stepsVisible, setStepsVisible] = useState<boolean[]>(Array(stepCount).fill(false))

  const steps = source === 'photos' ? PHOTO_STEPS : source === 'assisted' ? ASSISTED_STEPS : CSV_STEPS
  const acceptTypes = source === 'garmin_zip' ? '.zip' : source === 'csv' ? '.csv,.xlsx' : '.jpg,.jpeg,.png,.heic'
  const isMultiple = source !== 'csv' && source !== 'garmin_zip'

  // Staggered step reveal
  useEffect(() => {
    const count = isGarminZip ? GARMIN_ZIP_STEPS.length : 3
    const timers = Array.from({ length: count }, (_, i) =>
      setTimeout(() => setStepsVisible(prev => {
        const n = [...prev]
        n[i] = true
        return n
      }), 100 + i * 400)
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
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Fase 1: Solicitar tus datos
          </h3>
          <p style={{ color: 'var(--text-2)', fontSize: '12px', margin: 0, opacity: 0.8 }}>
            Solo una vez — Garmin tarda 24 a 48 horas
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
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: '14px',
                opacity: stepsVisible[i] ? 1 : 0,
                transform: stepsVisible[i] ? 'translateY(0)' : 'translateY(18px)',
                transition: 'opacity 0.5s ease-out, transform 0.5s ease-out',
              }}
            >
              {/* Number circle — gold */}
              <span
                style={{
                  width: '36px',
                  height: '36px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'linear-gradient(135deg, #c4992a, #e8c06a)',
                  color: '#070d18',
                  borderRadius: '50%',
                  fontSize: '15px',
                  fontWeight: 700,
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {step.number}
              </span>

              <div style={{ flex: 1 }}>
                <div style={{ color: 'var(--text)', fontSize: '15px', fontWeight: 600, lineHeight: 1.4, marginBottom: '4px' }}>
                  {step.title}
                </div>
                <div style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.5 }}>
                  {step.description}
                </div>
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

        {/* Phase 2: Subir el archivo */}
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
            textTransform: 'uppercase',
            letterSpacing: '0.5px',
          }}>
            Fase 2: Subir el archivo
          </h3>
          <p style={{ color: 'var(--text-2)', fontSize: '12px', margin: 0, opacity: 0.8 }}>
            Cuando recibas el email de Garmin con el link de descarga
          </p>
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

        {/* Info note */}
        <div
          style={{
            padding: '12px 16px',
            background: 'rgba(196,153,42,0.06)',
            border: '1px solid rgba(196,153,42,0.15)',
            borderRadius: '12px',
            marginTop: '20px',
            display: 'flex',
            gap: '10px',
            alignItems: 'flex-start',
          }}
        >
          <span style={{ fontSize: '16px', flexShrink: 0, marginTop: '1px' }}>
            {'\uD83D\uDCA1'}
          </span>
          <span style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.5 }}>
            {TIPS.garmin_zip}
          </span>
        </div>
      </div>
    )
  }

  // Standard guide for photos, csv, assisted
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
          <span style={{ color: 'var(--text-2)', fontSize: '13px', lineHeight: 1.5 }}>
            {TIPS[source]}
          </span>
          {source === 'csv' && (
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
              {source === 'csv' ? 'Procesando archivo...' : 'Subiendo fotos...'}
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '36px' }}>
              {source === 'csv' ? '\uD83D\uDCC4' : '\uD83D\uDCF8'}
            </span>
            <span style={{ color: 'var(--text-2)', fontSize: '14px', textAlign: 'center' }}>
              Arrastra tu archivo aqui o toca para seleccionar
            </span>
            <span style={{ color: 'var(--text-3, #5a6a7d)', fontSize: '12px' }}>
              {source === 'csv' ? 'CSV o XLSX' : 'JPG, PNG o HEIC — hasta 20 fotos'}
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
