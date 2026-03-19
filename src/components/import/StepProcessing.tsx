'use client'

import { useEffect, useRef } from 'react'
import type { ImportRoundData } from '@/lib/import-types'
import type { ImportState } from './ImportWizard'

interface StepProcessingProps {
  state: ImportState
  onStateUpdate: (partial: Partial<ImportState>) => void
  onComplete: (rounds: ImportRoundData[]) => void
}

const MESSAGES = [
  'Analizando archivos...',
  'Detectando campos y cursos...',
  'Extrayendo scores hoyo por hoyo...',
  'Validando datos...',
  'Calculando tu CPI...',
]

export default function StepProcessing({ state, onStateUpdate, onComplete }: StepProcessingProps) {
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const messageIndexRef = useRef(0)

  useEffect(() => {
    // Animate messages
    const msgInterval = setInterval(() => {
      messageIndexRef.current = (messageIndexRef.current + 1) % MESSAGES.length
      onStateUpdate({
        processingMessage: MESSAGES[messageIndexRef.current],
      })
    }, 2500)

    // Animate progress
    let progress = 10
    const progressInterval = setInterval(() => {
      progress = Math.min(progress + Math.random() * 8, 90)
      onStateUpdate({ processingProgress: progress })
    }, 800)

    // Poll job status if we have a jobId
    if (state.jobId) {
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/import/status?jobId=${state.jobId}`)
          if (!res.ok) return
          const data = await res.json()

          if (data.status === 'review_required' && data.rounds) {
            onStateUpdate({ processingProgress: 100 })
            setTimeout(() => onComplete(data.rounds), 400)
          } else if (data.status === 'failed') {
            onStateUpdate({
              processingMessage: 'Error procesando. Intenta de nuevo.',
              processingProgress: 0,
            })
          }
        } catch {
          // silently retry
        }
      }, 3000)
    }

    // Set initial message
    onStateUpdate({ processingMessage: MESSAGES[0] })

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
          color: '#edeae4',
          marginBottom: '8px',
        }}
      >
        Procesando tus rondas
      </h2>

      <p
        style={{
          color: '#94a8c0',
          fontSize: '14px',
          marginBottom: '32px',
          minHeight: '20px',
          transition: 'opacity 0.3s',
        }}
      >
        {state.processingMessage || MESSAGES[0]}
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

      <p style={{ color: '#5a6a7d', fontSize: '12px' }}>
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
