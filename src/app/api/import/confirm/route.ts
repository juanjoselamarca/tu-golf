import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import type { ImportRoundData } from '@/lib/import-types'
import { guardarTarjetasImportadas, LecturaGarminError, recalcularTrasImportar } from '@/lib/import/confirmar'
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
        { error: 'Datos de importación inválidos', code: 'invalid_rounds', details: parsed.error.issues.slice(0, 5) },
        { status: 400 },
      )
    }
    const { job_id, rounds: selectedRounds } = parsed.data as {
      job_id: string
      rounds: ImportRoundData[]
    }

    // Verify job belongs to user
    const { data: job, error: jobError } = await supabase
      .from('import_jobs')
      .select('*')
      .eq('id', job_id)
      .eq('user_id', user.id)
      .single()

    if (jobError || !job) {
      return NextResponse.json({ error: 'Job no encontrado o no te pertenece' }, { status: 404 })
    }

    // Reintento tras un corte: el primer confirm terminó en el servidor y ya guardó. Se responde lo que guardó.
    if (job.status === 'completed') {
      return NextResponse.json({
        success: true,
        job_id,
        total_imported: job.total_imported ?? 0,
        total_updated: job.total_updated ?? 0,
      })
    }

    let guardadas: Awaited<ReturnType<typeof guardarTarjetasImportadas>>
    try {
      guardadas = await guardarTarjetasImportadas(supabase, user.id, selectedRounds)
    } catch (err) {
      if (!(err instanceof LecturaGarminError)) throw err
      void captureError(err.causa, { context: 'import.confirm.filas-garmin', userId: user.id, meta: { jobId: job_id } })
      return NextResponse.json({ error: 'No pudimos leer tus tarjetas Garmin. Intenta de nuevo en un momento.' }, { status: 503 })
    }
    const { insertedIds, updatedIds, errors: insertErrors, duplicates } = guardadas

    // Update job status. Con 0 guardadas el job queda abierto: el usuario puede
    // descartar la tarjeta que falló y reintentar (un job completado solo repite lo que guardó).
    if (insertedIds.length + updatedIds.length > 0) await supabase
      .from('import_jobs')
      .update({
        status: 'completed',
        // Misma definición que la respuesta: solo nuevas (las re-escritas van aparte).
        total_imported: insertedIds.length,
        total_updated: updatedIds.length,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job_id)

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
