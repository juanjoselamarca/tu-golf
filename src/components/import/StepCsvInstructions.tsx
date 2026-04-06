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

const SUPPORTED_APPS = [
  'The Grint',
  'SwingU',
  '18Birdies',
  'Arccos',
  'Hole19',
  'GolfLogix',
  'GHIN (USGA)',
]

export default function StepCsvInstructions({
  onBack,
  onFileReady,
  onStateUpdate,
}: InstructionProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsMapping, setNeedsMapping] = useState(false)
  const [headers, setHeaders] = useState<string[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return

    setError(null)
    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', files[0])

      const res = await fetch('/api/import/csv', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        throw new Error('Error procesando archivo')
      }

      const data = await res.json()

      if (data.needsMapping) {
        setNeedsMapping(true)
        setHeaders(data.headers || [])
        setUploading(false)
        return
      }

      onStateUpdate({
        jobId: data.job_id,
        rounds: data.rounds || [],
      })
      onFileReady?.()
    } catch (err) {
      console.error('Upload error:', err)
      setError('Error al procesar el archivo. Verifica el formato.')
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
            {'\uD83D\uDCC4'} Importar CSV / Excel
          </h2>
        </div>
      </div>

      {/* Supported apps */}
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
          Apps compatibles:
        </p>
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {SUPPORTED_APPS.map(app => (
            <span
              key={app}
              style={{
                padding: '6px 12px',
                borderRadius: '8px',
                background: 'rgba(196,153,42,0.1)',
                color: '#c4992a',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {app}
            </span>
          ))}
        </div>
        <p
          style={{
            color: '#5a6a7d',
            fontSize: '12px',
            marginTop: '12px',
            marginBottom: 0,
          }}
        >
          Tambien aceptamos cualquier CSV con columnas de fecha, campo y score.
        </p>
      </div>

      {/* Mapping UI (if needed) */}
      {needsMapping && (
        <div
          style={{
            background: 'rgba(255,180,50,0.05)',
            border: '1px solid rgba(255,180,50,0.2)',
            borderRadius: '14px',
            padding: '16px',
            marginBottom: '24px',
          }}
        >
          <p
            style={{
              fontWeight: 600,
              fontSize: '14px',
              color: '#f0ad4e',
              marginBottom: '12px',
            }}
          >
            {'\u26A0\uFE0F'} Mapeo de columnas necesario
          </p>
          <p
            style={{
              color: '#94a8c0',
              fontSize: '13px',
              marginBottom: '12px',
            }}
          >
            No pudimos detectar automáticamente las columnas. Estas son las
            columnas encontradas:
          </p>
          <div
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            {headers.map(h => (
              <span
                key={h}
                style={{
                  padding: '4px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#94a8c0',
                  fontSize: '12px',
                  fontFamily: 'monospace',
                }}
              >
                {h}
              </span>
            ))}
          </div>
          <p
            style={{
              color: '#5a6a7d',
              fontSize: '12px',
              marginTop: '12px',
              marginBottom: 0,
            }}
          >
            La asignacion manual de columnas estara disponible pronto. Intenta
            renombrar las columnas a: fecha, campo, score_total.
          </p>
        </div>
      )}

      {/* Upload area */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        onChange={e => handleFile(e.target.files)}
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
              Procesando archivo...
            </span>
          </>
        ) : (
          <>
            <span style={{ fontSize: '32px' }}>{'\uD83D\uDCC4'}</span>
            <span
              style={{ color: '#c4992a', fontWeight: 600, fontSize: '15px' }}
            >
              Seleccionar archivo
            </span>
            <span style={{ color: '#5a6a7d', fontSize: '12px' }}>
              CSV, XLSX o XLS
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
