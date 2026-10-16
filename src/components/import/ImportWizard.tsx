'use client'

import { useState, useCallback } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { ERROR_IMPORT_IA_NO_DISPONIBLE, type ImportRoundData } from '@/lib/import-types'
import type { ResultadoCPI } from '@/golf/stats/cpi'
import { captureError } from '@/lib/error-tracking'
import { detalleNoGuardadas, type ResultadoConfirmacion } from '@/hooks/useConfirmarImportacion'
import { subirFotosImportacion } from '@/lib/import/subir-fotos'
import { fetchJsonConPlazo, JsonInvalidoError } from '@/lib/red/fetch-json-con-plazo'
import { LIMITE_CUERPO_SUBIDA_BYTES } from '@/lib/red/limite-cuerpo'
import { PLAZO_IMPORTACION_MS } from '@/lib/red/plazos'
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
  /** Lo que /api/import/confirm efectivamente guardó (null hasta confirmar). */
  confirmacion: ResultadoConfirmacion | null
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
  confirmacion: null,
  processingProgress: 0,
  processingMessage: '',
  fileCount: 0,
}

/**
 * POST de un archivo de importación (CSV o JSON de Garmin) bajo plazo, tolerando un
 * cuerpo que no es JSON (413/504 de Vercel en texto plano): antes `res.json()` lanzaba
 * y el jugador veía `Unexpected token ... is not valid JSON`.
 */
async function postImportacion(url: string, body: FormData): Promise<Record<string, unknown>> {
  let res: Response
  let json: unknown
  try {
    ;({ res, json } = await fetchJsonConPlazo(url, { method: 'POST', body }, PLAZO_IMPORTACION_MS, {
      leerCuerpoSiNoOk: true,
    }))
  } catch (err) {
    throw new Error(
      err instanceof JsonInvalidoError
        ? 'No pudimos procesar el archivo. Intenta de nuevo en unos segundos.'
        : 'No pudimos subir el archivo. Revisa tu conexión e intenta de nuevo.',
    )
  }
  const data = (json ?? {}) as Record<string, unknown>
  if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `Error ${res.status} al procesar archivo`)
  return data
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
          if (!file.name.toLowerCase().endsWith('.zip')) {
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
            const zipBuffer = await file.arrayBuffer()
            const zip = await JSZip.loadAsync(zipBuffer)

            // Find the files we need — iterate with proper await
            const filePaths = Object.keys(zip.files)

            // Find scorecard
            const scorecardPath = filePaths.find(p => {
              const lower = p.toLowerCase()
              return lower.includes('golf-scorecard.json') && !lower.includes('rawdata') && !zip.files[p].dir
            })

            // Find course
            const coursePath = filePaths.find(p => {
              const lower = p.toLowerCase()
              return lower.includes('golf-course.json') && !zip.files[p].dir
            })

            if (scorecardPath) {
              scorecardJson = await zip.files[scorecardPath].async('text')
            }
            if (coursePath) {
              courseJson = await zip.files[coursePath].async('text')
            }
          } catch {
            throw new Error('No se pudo leer el archivo ZIP. Verifica que sea el archivo correcto de Garmin.')
          }

          if (!scorecardJson) {
            throw new Error('No se encontraron datos de golf en el archivo. Busca el archivo ZIP que te envio Garmin por email.')
          }

          // Send only the extracted JSONs (tiny: ~350KB vs 80MB ZIP)
          const scorecardBlob = new Blob([scorecardJson], { type: 'application/json' })
          if (scorecardBlob.size > LIMITE_CUERPO_SUBIDA_BYTES) {
            throw new Error('Tu historial de Garmin es demasiado grande para subirlo de una vez. Escríbenos y lo importamos por partes.')
          }
          formData.append('scorecard_json', scorecardBlob, 'Golf-SCORECARD.json')
          // La cancha es opcional (el servidor la ignora si falta): solo si cabe en el mismo request.
          if (courseJson) {
            const courseBlob = new Blob([courseJson], { type: 'application/json' })
            if (scorecardBlob.size + courseBlob.size <= LIMITE_CUERPO_SUBIDA_BYTES) {
              formData.append('course_json', courseBlob, 'Golf-COURSE.json')
            }
          }

          const data = await postImportacion('/api/import/garmin-zip', formData) as {
            job_id?: string
            rounds?: ImportRoundData[]
          }

          if (data.rounds && data.rounds.length > 0) {
            updateState({
              jobId: data.job_id ?? null,
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
          const data = await subirFotosImportacion(Array.from(files))

          if (data.rounds.length > 0) {
            updateState({
              jobId: data.jobId,
              rounds: data.rounds,
              step: 'review',
              fileCount: files.length,
            })
          } else if (data.errors.length > 0) {
            const firstError = data.errors[0]?.error || 'Error desconocido'
            const errorMsg = firstError === 'not_a_scorecard'
              ? 'No se detectó una tarjeta de golf en la imagen. Asegúrate de que sea un pantallazo de Garmin Golf.'
              : firstError === ERROR_IMPORT_IA_NO_DISPONIBLE || firstError.includes('API')
                ? 'Error conectando con el servicio de lectura de fotos. Intenta de nuevo en unos segundos.'
                : `No se pudo leer la foto: ${firstError}`
            throw new Error(errorMsg)
          } else {
            throw new Error('No se detectaron rondas en la imagen. Asegúrate de subir un pantallazo de Garmin Golf (Activity o Scorecard).')
          }
        } else {
          // CSV
          const file = files[0]
          if (!file.name.toLowerCase().endsWith('.csv')) {
            setUploadError('Sube un archivo CSV. Si lo tienes en Excel, usa "Guardar como" → CSV.')
            setUploading(false)
            return
          }
          if (file.size > LIMITE_CUERPO_SUBIDA_BYTES) {
            setUploadError('El archivo es demasiado grande. Divídelo en partes de menos de 4 MB.')
            setUploading(false)
            return
          }
          formData.append('file', file)

          const data = await postImportacion('/api/import/csv', formData) as {
            job_id?: string
            needsMapping?: boolean
            rounds?: ImportRoundData[]
          }

          if (data.needsMapping) {
            setUploadError(
              'No reconocemos las columnas de este archivo. Por ahora leemos los CSV de 18Birdies (date, course, total) y GolfGameBook (date, course name, gross score). Para Garmin, sube el ZIP o pantallazos.',
            )
            setUploading(false)
            return
          }

          updateState({
            jobId: data.job_id ?? null,
            rounds: data.rounds || [],
            step: (data.rounds?.length ?? 0) > 0 ? 'review' : 'processing',
            fileCount: 1,
          })
        }
      } catch (err) {
        void captureError(err, { context: 'import.upload', meta: { source: state.source } })
        const errMsg = err instanceof Error ? err.message : ''
        // Preserve specific server errors (e.g. Gemini unavailable)
        const fallback = state.source === 'garmin_zip'
          ? 'Error al procesar el archivo ZIP. Verifica que sea el archivo de Garmin.'
          : state.source === 'photos'
            ? 'Error al subir las fotos. Intenta de nuevo.'
            : 'Error al procesar el archivo. Verifica el formato.'
        setUploadError(errMsg || fallback)
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
            background: 'var(--brand)',
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
            background: 'var(--surface-soft)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            color: 'var(--text-2)',
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
            onConfirm={(confirmacion) =>
              updateState({
                step: 'celebration',
                confirmacion,
                cpiResult: confirmacion.cpiResult,
                insights: confirmacion.insights,
              })
            }
            onStateUpdate={updateState}
          />
        )}

        {/* IMPORTANTE: la celebración NO debe depender de `cpiResult`. El CPI
            solo se calcula con ≥3 rondas históricas (api/import/confirm), así que
            un usuario nuevo importando sus primeras 1-2 tarjetas recibe
            cpiResult=null en 200 OK. El guard previo `&& state.cpiResult` dejaba
            la pantalla EN BLANCO tras una importación exitosa (inbox ccadf3c4).
            StepCelebration ya no usa cpiResult — solo roundCount. */}
        {state.step === 'celebration' && (
          <StepCelebration
            cpiResult={state.cpiResult}
            insights={state.insights}
            roundCount={(state.confirmacion?.importadas ?? 0) + (state.confirmacion?.actualizadas ?? 0)}
            detalle={state.confirmacion ? detalleNoGuardadas(state.confirmacion) : null}
            teelessCount={state.rounds.filter(r =>
              !r.tee_color && !(state.confirmacion?.noGuardadas ?? []).includes(r.tempId),
            ).length}
          />
        )}
      </div>
    </div>
  )
}
