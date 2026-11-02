import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { ERROR_IMPORT_CONFIRM_EN_CURSO, ERROR_IMPORT_DATOS_INVALIDOS, type ImportRoundData } from '@/lib/import-types'
import { guardarTarjetasImportadas, LecturaGarminError, recalcularTrasImportar, resultadoDelJobCompletado } from '@/lib/import/confirmar'
import { completarJobImport, fetchJobImport, soltarJobImport, tomarJobImport } from '@/lib/data/import-jobs'
import { captureError } from '@/lib/error-tracking'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { z } from 'zod'
export const dynamic = 'force-dynamic'
// Guarda ronda por ronda: 125 tarjetas Garmin tardaron 68 s. El cliente espera un poco más (PLAZO_CONFIRMAR_IMPORTACION_MS).
export const maxDuration = 300

// ── Zod schema for request validation ────────────────────────
const ImportRoundSchema = z.object({
  tempId: z.string().min(1).max(100),
  played_at: z.string().regex(/^\d{4}-\d{2}-\d{2}/, 'Fecha inválida'),
  course_name: z.string().min(1).max(200),
  total_gross: z.number().int().min(9).max(200),
  holes_played: z.union([z.literal(9), z.literal(18)]),
  scores: z.record(z.string(), z.number().int().min(1).max(20)),
  par_per_hole: z.record(z.string(), z.number().int().min(2).max(6)).optional().nullable(),
  course_rating: z.number().min(50).max(90).optional().nullable(),
  slope_rating: z.number().int().min(55).max(155).optional().nullable(),
  course_id: z.string().uuid().optional().nullable(),
  tee_color: z.string().max(50).optional().nullable(),
  formato_juego: z.enum(['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome']).optional(),
  modo_juego: z.enum(['gross', 'neto']).optional(),
  metadata: z.object({
    putts: z.number().int().min(0).optional(),
    putts_per_hole: z.record(z.string(), z.number().int().min(0).max(10)).optional(),
    fairways: z.number().int().min(0).optional(),
    gir: z.number().int().min(0).optional(),
    gir_per_hole: z.record(z.string(), z.number().int().min(0).max(1)).optional(),
    reconstruction_method: z.literal('color_bar').optional(),
    ambiguous_holes: z.array(z.number().int().min(1).max(18)).optional(),
    garmin_scorecard_id: z.string().optional(),
    penalties: z.number().int().min(0).optional(),
    tee_box: z.string().optional(),
    course_rating: z.number().optional(),
    slope_rating: z.number().optional(),
    distance_walked: z.number().optional(),
    import_source: z.enum(['garmin_zip', 'csv', 'photo_scan', 'fit']).optional(),
    is_duplicate: z.boolean().optional(),
    existing_id: z.boolean().optional(),
    // Loops de un club de 27h (`fetchHoyosDeLaRonda`).
    recorridos: z.array(z.string().max(100)).max(3).nullable().optional(),
  }).passthrough().optional(),
  import_confidence: z.number().min(0).max(1),
  validation: z.object({
    valid: z.boolean(),
    holesPlayed: z.number().int().min(1).max(18),
    issues: z.array(z.object({
      type: z.enum(['missing_score', 'score_out_of_range', 'unknown_course', 'incomplete_round']),
      holeNumber: z.number().int().optional(),
      message: z.string(),
      canFix: z.boolean(),
    })),
  }),
})

const ConfirmBodySchema = z.object({
  job_id: z.string().uuid(),
  rounds: z.array(ImportRoundSchema).min(1).max(200),
})

// ── Route Handler ─────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    // Rate limit: 10 confirmaciones por minuto por usuario (previene spam de importación)
    const rl = checkRateLimit(`import-confirm:${user.id}`, 10, 60 * 1000)
    if (!rl.allowed) {
      return NextResponse.json(
        { error: 'Demasiados intentos de importación. Intenta de nuevo en un minuto.' },
        { status: 429, headers: rateLimitHeaders(rl) },
      )
    }

    const body = await request.json()
    const parsed = ConfirmBodySchema.safeParse(body)
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Datos de importación inválidos', code: ERROR_IMPORT_DATOS_INVALIDOS, details: parsed.error.issues.slice(0, 5) },
        { status: 400 },
      )
    }
    const { job_id, rounds: selectedRounds } = parsed.data as {
      job_id: string
      rounds: ImportRoundData[]
    }

    const job = await fetchJobImport(supabase, job_id, user.id)
    if (!job) {
      return NextResponse.json({ error: 'Job no encontrado o no te pertenece' }, { status: 404 })
    }

    // Reintento tras un corte: el primer confirm terminó en el servidor y ya guardó. Se responde lo que guardó.
    if (job.status === 'completed') return NextResponse.json(resultadoDelJobCompletado(job))

    // Si el primer confirm sigue guardando, se espera su resultado en vez de guardar el lote dos veces.
    const toma = await tomarJobImport(supabase, job_id, user.id)
    if (!toma.tomado) {
      if (toma.completado) return NextResponse.json(resultadoDelJobCompletado(toma.completado))
      // El cliente no lo reporta (es esperado); este aviso deja ver un job que quedó tomado sin soltarse.
      // Con await: es la única señal y la respuesta ya esperó, no se arriesga a que la función se congele antes.
      await captureError(new Error('import confirm: se agotó la espera del confirm en curso'), {
        context: 'import.confirm.en-curso',
        level: 'warning',
        userId: user.id,
        meta: { jobId: job_id },
      })
      // Sin `error`: el mensaje lo pone el cliente según el code.
      return NextResponse.json({ code: ERROR_IMPORT_CONFIRM_EN_CURSO }, { status: 409 })
    }

    let guardadas: Awaited<ReturnType<typeof guardarTarjetasImportadas>>
    let completado = false
    try {
      guardadas = await guardarTarjetasImportadas(supabase, user.id, selectedRounds)
      // Con 0 guardadas el job vuelve a revisión: el usuario puede descartar la tarjeta que falló y reintentar.
      if (guardadas.insertedIds.length + guardadas.updatedIds.length > 0) {
        completado = await completarJobImport(supabase, job_id, guardadas)
      }
    } catch (err) {
      if (!(err instanceof LecturaGarminError)) throw err
      void captureError(err.causa, { context: 'import.confirm.filas-garmin', userId: user.id, meta: { jobId: job_id } })
      return NextResponse.json({ error: 'No pudimos leer tus tarjetas Garmin. Intenta de nuevo en un momento.' }, { status: 503 })
    } finally {
      if (!completado) await soltarJobImport(supabase, job_id)
    }
    const { insertedIds, updatedIds, errors: insertErrors, duplicates } = guardadas

    const cpiResult = await recalcularTrasImportar(supabase, user.id, insertedIds.length)

    return NextResponse.json({
      success: true,
      job_id,
      total_imported: insertedIds.length,
      total_updated: updatedIds.length,
      total_errors: insertErrors.length,
      total_duplicates: duplicates.length,
      inserted_ids: insertedIds,
      updated_ids: updatedIds.length > 0 ? updatedIds : undefined,
      errors: insertErrors.length > 0 ? insertErrors : undefined,
      duplicates: duplicates.length > 0 ? duplicates : undefined,
      cpi: cpiResult ?? null,
      cpiResult: cpiResult ?? null,
    })
  } catch (err) {
    void captureError(err, { context: 'import.confirm-handler-error' })
    return NextResponse.json(
      { error: 'Error interno al confirmar importación' },
      { status: 500 }
    )
  }
}
