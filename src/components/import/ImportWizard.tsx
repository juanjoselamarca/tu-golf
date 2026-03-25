'use client'

import { useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import type { ImportRoundData } from '@/lib/import-types'
import type { ResultadoCPI } from '@/lib/cpi'
import StepSurvey from './StepSurvey'
import StepSelector from './StepSelector'
import ImportGuide from './ImportGuide'
import StepProcessing from './StepProcessing'
import StepReview from './StepReview'
import StepCelebration from './StepCelebration'

export type ImportSource = 'photos' | 'csv' | 'garmin_zip' | null
export type WizardStep =
  | 'survey'
  | 'selector'
  | 'guide'
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
  fileCount: number
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
  fileCount: 0,
}

const STEP_INDEX: Record<WizardStep, number> = {
  survey: 0,
  selector: 1,
  guide: 2,
  processing: 3,
  review: 4,
  celebration: 5,
}

export default function ImportWizard() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const rawSource = searchParams.get('source')
  const initialSource: ImportSource =
    rawSource === 'photos' || rawSource === 'csv' || rawSource === 'garmin_zip' ? rawSource : null

  const surveyDone = typeof window !== 'undefined' && localStorage.getItem('golfers_import_survey_done') === 'true'
  const initialStep: WizardStep = initialSource ? 'guide' : surveyDone ? 'selector' : 'survey'

  const [state, setState] = useState<ImportState>({
    ...INITIAL_STATE,
    source: initialSource,
    step: initialStep,
  })

  const [recommendation, setRecommendation] = useState<'photos' | 'garmin_zip' | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)

  const updateState = useCallback((partial: Partial<ImportState>) => {
    setState(prev => ({ ...prev, ...partial }))
  }, [])

  const handleSourceSelect = useCallback(
    (source: ImportSource) => {
      updateState({ source, step: 'guide' })
    },
    [updateState],
  )

  const handleBack = useCallback(() => {
    if (state.step === 'guide') {
      updateState({ step: 'selector', source: null })
      setUploadError(null)
      setUploading(false)
    } else if (state.step === 'review') {
      updateState({ step: 'guide' })
      setUploadError(null)
      setUploading(false)
    } else if (state.step === 'processing') {
      updateState({ step: 'guide' })
      setUploadError(null)
      setUploading(false)
    }
  }, [state.step, updateState])

  const handleClose = useCallback(() => {
    router.push('/dashboard')
  }, [router])

  // Unified file upload handler for photo, CSV, and garmin_zip
  const handleFilesSelected = useCallback(
    async (files: FileList) => {
      if (!state.source) return

      setUploadError(null)
      setUploading(true)

      try {
        const formData = new FormData()

        if (state.source === 'garmin_zip') {
          const file = files[0]
          if (!file.name.endsWith('.zip')) {
            setUploadError('Por favor selecciona un archivo ZIP de Garmin')
            setUploading(false)
            return
          }

          // Extract Golf-SCORECARD.json and Golf-COURSE.json CLIENT-SIDE
          // The full ZIP can be 80+ MB (fitness data, GPS, etc.) which exceeds
          // Vercel's 4.5MB request body limit. The golf JSONs are only ~350KB.
          let scorecardJson: string | null = null
          let courseJson: string | null = null

          try {
            const JSZip = (await import('jszip')).default
            const zip = await JSZip.loadAsync(await file.arrayBuffer())

            // Search for Golf-SCORECARD.json in any path
            zip.forEach((path, entry) => {
              if (!entry.dir) {
                const lower = path.toLowerCase()
                if (lower.includes('golf-scorecard.json') && !lower.includes('rawdata')) {
                  entry.async('text').then(text => { scorecardJson = text })
                }
                if (lower.includes('golf-course.json')) {
                  entry.async('text').then(text => { courseJson = text })
                }
              }
            })

            // Wait for async reads
            await new Promise(resolve => setTimeout(resolve, 500))

            // Retry with await if not found yet
            if (!scorecardJson) {
              for (const [path, entry] of Object.entries(zip.files)) {
                if (!entry.dir && path.toLowerCase().includes('golf-scorecard.json') && !path.toLowerCase().includes('rawdata')) {
                  scorecardJson = await entry.async('text')
                  break
                }
              }
            }
            if (!courseJson) {
              for (const [path, entry] of Object.entries(zip.files)) {
                if (!entry.dir && path.toLowerCase().includes('golf-course.json')) {
                  courseJson = await entry.async('text')
                  break
                }
              }
            }
          } catch {
            throw new Error('No se pudo leer el archivo ZIP. Verifica que sea el archivo correcto de Garmin.')
          }

          if (!scorecardJson) {
            throw new Error('No se encontraron datos de golf en el archivo. Busca el archivo ZIP que te envio Garmin por email.')
          }

          // Send only the extracted JSONs (tiny: ~350KB vs 80MB ZIP)
          formData.append('scorecard_json', new Blob([scorecardJson], { type: 'application/json' }), 'Golf-SCORECARD.json')
          if (courseJson) {
            formData.append('course_json', new Blob([courseJson], { type: 'application/json' }), 'Golf-COURSE.json')
          }

          const res = await fetch('/api/import/garmin-zip', {
            method: 'POST',
            body: formData,
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error || 'Error procesando archivo')

          if (data.rounds && data.rounds.length > 0) {
            updateState({
              jobId: data.job_id,
              rounds: data.rounds,
              step: 'review',
              fileCount: 1,
            })
          } else {
            throw new Error('No se encontraron rondas de golf en el archivo')
          }
        } else if (state.source === 'photos') {
          if (files.length > 20) {
            setUploadError('Maximo 20 fotos por vez')
            setUploading(false)
            return
          }
          Array.from(files).forEach(file => formData.append('images', file))

          const res = await fetch('/api/import/screenshot', {
            method: 'POST',
            body: formData,
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `Error ${res.status} al subir fotos`)

          if (data.rounds && data.rounds.length > 0) {
            updateState({
              jobId: data.job_id,
              rounds: data.rounds,
              step: 'review',
              fileCount: files.length,
            })
          } else if (data.errors && data.errors.length > 0) {
            const firstError = data.errors[0]?.error || 'Error desconocido'
            const errorMsg = firstError === 'not_a_scorecard'
              ? 'No se detecto una tarjeta de golf en la imagen. Asegurate de que sea un pantallazo de Garmin Golf.'
              : firstError.includes('API')
                ? 'Error conectando con el servicio de lectura de fotos. Intenta de nuevo en unos segundos.'
                : `No se pudo leer la foto: ${firstError}`
            throw new Error(errorMsg)
          } else {
            throw new Error('No se detectaron rondas en la imagen. Asegurate de subir un pantallazo de Garmin Golf (Activity o Scorecard).')
          }
        } else {
          // CSV
          formData.append('file', files[0])

          const res = await fetch('/api/import/csv', {
            method: 'POST',
            body: formData,
          })

          const data = await res.json()
          if (!res.ok) throw new Error(data.error || `Error ${res.status} al procesar archivo`)

          if (data.needsMapping) {
            setUploadError(
              'No pudimos detectar las columnas automaticamente. Renombra las columnas a: fecha, campo, score_total.',
            )
            setUploading(false)
            return
          }

          updateState({
            jobId: data.job_id,
            rounds: data.rounds || [],
            step: data.rounds?.length > 0 ? 'review' : 'processing',
            fileCount: 1,
          })
        }
      } catch (err) {
        console.error('Upload error:', err)
        setUploadError(
          state.source === 'garmin_zip'
            ? 'Error al procesar el archivo ZIP. Verifica que sea el archivo de Garmin.'
            : state.source === 'photos'
              ? 'Error al subir las fotos. Intenta de nuevo.'
              : 'Error al procesar el archivo. Verifica el formato.',
        )
        setUploading(false)
      }
    },
    [state.source, updateState],
  )

  const progress = ((STEP_INDEX[state.step] + 1) / 6) * 100

  // Guide source — each mode gets its own guide
  const guideSource = state.source

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
        {state.step === 'survey' && (
          <StepSurvey
            onComplete={(rec) => {
              setRecommendation(rec)
              updateState({ step: 'selector' })
            }}
          />
        )}

        {state.step === 'selector' && (
          <StepSelector onSelect={handleSourceSelect} recommendation={recommendation} />
        )}

        {state.step === 'guide' && guideSource && (
          <ImportGuide
            source={guideSource}
            onFilesSelected={handleFilesSelected}
            onBack={handleBack}
            uploading={uploading}
            error={uploadError}
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
