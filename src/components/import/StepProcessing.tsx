'use client'

import { useEffect, useRef } from 'react'
import type { ImportRoundData } from '@/lib/import-types'
import type { ImportState } from './ImportWizard'

interface StepProcessingProps {
  state: ImportState
  onStateUpdate: (partial: Partial<ImportState>) => void
  onComplete: (rounds: ImportRoundData[]) => void
}

const MESSAGES_PHOTO = [
  'Analizando imagenes...',
  'Detectando campos y cursos...',
  'Leyendo scores hoyo por hoyo...',
  'Validando datos...',
  'Calculando tu CPI...',
]

const MESSAGES_CSV = [
  'Analizando archivos...',
  'Detectando columnas y formato...',
  'Extrayendo scores...',
  'Validando datos...',
  'Calculando tu CPI...',
]

export default function StepProcessing({ state, onStateUpdate, onComplete }: StepProcessingProps) {
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageIndexRef = useRef(0)
  const imageProgressRef = useRef(0)

  const isPhoto = state.source === 'photos'
  const fileCount = state.fileCount || 1
  const messages = isPhoto ? MESSAGES_PHOTO : MESSAGES_CSV

  useEffect(() => {
    // Animate messages — smarter for photos
    const msgInterval = setInterval(() => {
      if (isPhoto && fileCount > 1) {
        // Show "Procesando imagen X de N" for first messages
        imageProgressRef.current = Math.min(imageProgressRef.current + 1, fileCount)
        if (imageProgressRef.current <= fileCount) {
          onStateUpdate({
            processingMessage: `Procesando imagen ${imageProgressRef.current} de ${fileCount}...`,
          })
        } else {
          messageIndexRef.current = Math.min(messageIndexRef.current + 1, messages.length - 1)
          onStateUpdate({
            processingMessage: messages[messageIndexRef.current],
          })
        }
      } else {
        messageIndexRef.current = (messageIndexRef.current + 1) % messages.length
        onStateUpdate({
          processingMessage: messages[messageIndexRef.current],
        })
      }
    }, 2500)

    // Animate progress
    let progress = 10
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 8, 90)
      onStateUpdate({ processingProgress: progress })
    }, 800)

    // Poll job status
    if (state.jobId) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/import/status?jobId=${state.jobId}`)
          if (!res.ok) return
          const data = await res.json()

          if (data.status === 'review_required' && data.rounds) {
            onStateUpdate({ processingProgress: 100 })
            setTimeout(() => onComplete(data.rounds), 400)
          } else if (data.status === 'completed' && data.rounds) {
            onStateUpdate({ processingProgress: 100 })
            setTimeout(() => onComplete(data.rounds), 400)
          } else if (data.status === 'failed') {
            onStateUpdate({
              processingMessage: 'Error procesando. Intenta de nuevo.',
              processingProgress: 0,
            })
          } else if (data.progress) {
            // Use server-side progress if available
            onStateUpdate({ processingProgress: Math.max(progress, data.progress) })
          }
        } catch {
          // silently retry
        }
      }, 3000)
    } else {
      // No jobId — if rounds are already populated (direct CSV parse), go to review
      if (state.rounds.length > 0) {
        onStateUpdate({ processingProgress: 100 })
        setTimeout(() => onComplete(state.rounds), 800)
      }
    }

    // Set initial message
    onStateUpdate({
      processingMessage: isPhoto && fileCount > 1
        ? `Procesando imagen 1 de ${fileCount}...`
        : messages[0],
    })

    return () => {
      clearInterval(msgInterval)
      clearInterval(progressInterval)
      if (pollingRef.current) clearInterval(pollingRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.jobId])

  return (
    <div
      style={{
        paddingTop: '80px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
      }}
    >
      {/* Spinner */}
      <div
        style={{
          width: '64px',
          height: '64px',
          border: '3px solid rgba(196,153,42,0.2)',
          borderTopColor: '#c4992a',
          borderRadius: '50%',
          animation: 'spin 1s linear infinite',
          marginBottom: '32px',
        }}
      />

      <h2
        style={{
          fontSize: '20px',
          fontWeight: 700,
          color: 'var(--text)',
          marginBottom: '8px',
        }}
      >
        Procesando tus rondas
      </h2>

      <p
        style={{
          color: 'var(--text-2)',
          fontSize: '14px',
          marginBottom: '32px',
          minHeight: '20px',
          transition: 'opacity 0.3s',
        }}
      >
        {state.processingMessage || messages[0]}
      </p>

      {/* Progress bar */}
      <div
        style={{
          width: '100%',
          maxWidth: '300px',
          height: '6px',
          background: 'rgba(255,255,255,0.05)',
          borderRadius: '3px',
          overflow: 'hidden',
          marginBottom: '16px',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${state.processingProgress}%`,
            background: 'linear-gradient(90deg, #c4992a, #d4a93a)',
            borderRadius: '3px',
            transition: 'width 0.5s ease',
          }}
        />
      </div>

      <p style={{ color: 'var(--text-3, #5a6a7d)', fontSize: '12px' }}>
        {state.rounds.length > 0
          ? `${state.rounds.length} rondas detectadas`
          : 'Esto puede tomar unos segundos'}
      </p>

      <style>{`
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}
