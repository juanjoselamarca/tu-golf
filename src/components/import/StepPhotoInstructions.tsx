'use client'

import { useState, useRef } from 'react'
import type { ImportState } from './ImportWizard'

interface InstructionProps {
  onBack: () => void
  onFileReady?: () => void
  onFilesReady?: () => void
  onStateUpdate: (partial: Partial<ImportState>) => void
  state: ImportState
}

const TIPS = [
  'Foto clara y bien iluminada del scorecard',
  'Incluye todos los hoyos en la imagen',
  'Evita sombras y reflejos sobre los numeros',
  'Puedes subir hasta 20 fotos a la vez',
]

export default function StepPhotoInstructions({
  onBack,
  onFilesReady,
  onStateUpdate,
}: InstructionProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    if (files.length > 20) {
      setError('Maximo 20 fotos por vez')
      return
    }

    setError(null)
    setUploading(true)

    try {
      const formData = new FormData()
      Array.from(files).forEach(file => formData.append('files', file))

      const res = await fetch('/api/import/screenshot', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Error subiendo fotos')
      }

      const data = await res.json()
      onStateUpdate({
        jobId: data.jobId,
        rounds: data.rounds || [],
      })
      onFilesReady?.()
    } catch (err) {
      console.error('Upload error:', err)
      setError('Error al subir las fotos. Intenta de nuevo.')
      setUploading(false)
    }
  }

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
            color: '#94a8c0',
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
              color: '#edeae4',
              margin: 0,
            }}
          >
            {'\uD83D\uDCF7'} Fotos de scorecard
          </h2>
        </div>
      </div>

      {/* Tips */}
      <div
        style={{
          background: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '14px',
          padding: '16px',
          marginBottom: '24px',
        }}
      >
        <p
          style={{
            fontWeight: 600,
            fontSize: '14px',
            color: '#edeae4',
            marginBottom: '12px',
          }}
        >
          Tips para mejores resultados:
        </p>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          {TIPS.map((tip, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  color: '#50c878',
                  fontSize: '12px',
                  flexShrink: 0,
                  marginTop: '2px',
                }}
              >
                {'\u2713'}
              </span>
              <p
                style={{
                  color: '#94a8c0',
                  fontSize: '13px',
                  lineHeight: 1.4,
                  margin: 0,
                }}
              >
                {tip}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Upload area */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={e => handleFiles(e.target.files)}
        style={{ display: 'none' }}
      />

      <button
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        style={{
          width: '100%',
          padding: '32px 20px',
          borderRadius: '16px',
          border: '2px dashed rgba(196,153,42,0.3)',
          background: uploading
            ? 'rgba(196,153,42,0.05)'
            : 'rgba(255,255,255,0.02)',
          cursor: uploading ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '12px',
          minHeight: '44px',
        }}
      >
        {uploading ? (
          <>
            <div
              style={{
                width: '32px',
                height: '32px',
                border: '2px solid rgba(196,153,42,0.2)',
                borderTopColor: '#c4992a',
                borderRadius: '50%',
                animation: 'spin 1s linear infinite',
              }}
            />
            <span style={{ color: '#94a8c0', fontSize: '14px' }}>
              Subiendo fotos...
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '32px' }}>{'\uD83D\uDCF7'}</span>
            <span
              style={{ color: '#c4992a', fontWeight: 600, fontSize: '15px' }}
            >
              Seleccionar fotos
            </span>
            <span style={{ color: '#5a6a7d', fontSize: '12px' }}>
              JPG, PNG o HEIC — hasta 20 fotos
            </span>
          </>
        )}
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

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
