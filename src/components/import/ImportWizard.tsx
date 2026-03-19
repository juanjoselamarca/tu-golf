'use client'

import { useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { ImportRoundData } from '@/lib/import-types'
import type { ResultadoCPI } from '@/lib/cpi'
import StepSelector from './StepSelector'
import StepGarminInstructions from './StepGarminInstructions'
import StepPhotoInstructions from './StepPhotoInstructions'
import StepCsvInstructions from './StepCsvInstructions'
import StepProcessing from './StepProcessing'
import StepReview from './StepReview'
import StepCelebration from './StepCelebration'

export type ImportSource = 'garmin' | 'photos' | 'csv' | null
export type WizardStep =
  | 'selector'
  | 'instructions'
  | 'processing'
  | 'review'
  | 'celebration'

export interface ImportState {
  source: ImportSource
  step: WizardStep
  rounds: ImportRoundData[]
  jobId: string | null
  cpiResult: ResultadoCPI | null
  insights: string[]
  processingProgress: number
  processingMessage: string
}

const INITIAL_STATE: ImportState = {
  source: null,
  step: 'selector',
  rounds: [],
  jobId: null,
  cpiResult: null,
  insights: [],
  processingProgress: 0,
  processingMessage: '',
}

const STEP_INDEX: Record<WizardStep, number> = {
  selector: 0,
  instructions: 1,
  processing: 2,
  review: 3,
  celebration: 4,
}

export default function ImportWizard() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const initialSource = (searchParams.get('source') as ImportSource) || null
  const [state, setState] = useState<ImportState>({
    ...INITIAL_STATE,
    source: initialSource,
    step: initialSource ? 'instructions' : 'selector',
  })

  const updateState = useCallback((partial: Partial<ImportState>) => {
    setState(prev => ({ ...prev, ...partial }))
  }, [])

  const handleSourceSelect = useCallback(
    (source: ImportSource) => {
      updateState({ source, step: 'instructions' })
    },
    [updateState],
  )

  const handleBack = useCallback(() => {
    if (state.step === 'instructions') {
      updateState({ step: 'selector', source: null })
    } else if (state.step === 'review') {
      updateState({ step: 'instructions' })
    }
  }, [state.step, updateState])

  const handleClose = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  const progress = ((STEP_INDEX[state.step] + 1) / 5) * 100

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
      }}
    >
      {/* Progress bar */}
      <div
        style={{
          height: '3px',
          background: 'rgba(196,153,42,0.15)',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            background: '#c4992a',
            transition: 'width 0.4s ease',
            borderRadius: '0 2px 2px 0',
          }}
        />
      </div>

      {/* Close button */}
      {state.step !== 'celebration' && (
        <button
          onClick={handleClose}
          aria-label="Cerrar"
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            width: '44px',
            height: '44px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(255,255,255,0.05)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '12px',
            color: '#94a8c0',
            fontSize: '20px',
            cursor: 'pointer',
            zIndex: 40,
          }}
        >
          &times;
        </button>
      )}

      {/* Steps */}
      <div style={{ flex: 1, padding: '24px 16px', maxWidth: '600px', margin: '0 auto', width: '100%' }}>
        {state.step === 'selector' && (
          <StepSelector onSelect={handleSourceSelect} />
        )}

        {state.step === 'instructions' && state.source === 'garmin' && (
          <StepGarminInstructions
            onBack={handleBack}
            onStateUpdate={updateState}
            state={state}
          />
        )}

        {state.step === 'instructions' && state.source === 'photos' && (
          <StepPhotoInstructions
            onBack={handleBack}
            onFilesReady={() => updateState({ step: 'processing' })}
            onStateUpdate={updateState}
            state={state}
          />
        )}

        {state.step === 'instructions' && state.source === 'csv' && (
          <StepCsvInstructions
            onBack={handleBack}
            onFileReady={() => updateState({ step: 'processing' })}
            onStateUpdate={updateState}
            state={state}
          />
        )}

        {state.step === 'processing' && (
          <StepProcessing
            state={state}
            onStateUpdate={updateState}
            onComplete={(rounds) =>
              updateState({ step: 'review', rounds })
            }
          />
        )}

        {state.step === 'review' && (
          <StepReview
            rounds={state.rounds}
            jobId={state.jobId}
            onBack={handleBack}
            onConfirm={(cpiResult, insights) =>
              updateState({ step: 'celebration', cpiResult, insights })
            }
            onStateUpdate={updateState}
          />
        )}

        {state.step === 'celebration' && state.cpiResult && (
          <StepCelebration
            cpiResult={state.cpiResult}
            insights={state.insights}
            roundCount={state.rounds.filter(r => r.validation.valid).length}
          />
        )}
      </div>
    </div>
  )
}
