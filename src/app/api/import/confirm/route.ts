import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { calcularCPI, validarRonda } from '@/golf/stats/cpi'
import { calcularNivel } from '@/lib/indice-golfers'
import { detectAndSavePatterns } from '@/golf/coach/detect-and-save-patterns'
import type { ImportRoundData } from '@/lib/import-types'
import { importRound, metadataDelImport, tarjetaDelImport, type ImportSource } from '@/lib/import-round'
import { actualizacionGarmin, fetchFilasGarminExistentes } from '@/lib/data/import-garmin'
import { COLS_PERFIL_IMPORT } from '@/lib/data/import-tarjeta'
import { fetchRondasCPI } from '@/lib/data/perfil'
import { callLLM, AllProvidersFailedError } from '@/lib/ai'
import { captureError } from '@/lib/error-tracking'
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { z } from 'zod'
import { createAdminClient } from '@/lib/supabaseAdmin'
export const dynamic = 'force-dynamic'

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

// ── Generate tAIger+ insights (async, non-blocking) ──────────

async function generarInsights(
  userId: string,
  importedCount: number,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<void> {
  try {
    // Get recent rounds for context
    const { data: recentRounds } = await supabase
      .from('historical_rounds')
      .select('course_name, total_gross, played_at, scores')
      .eq('user_id', userId)
      .order('played_at', { ascending: false })
      .limit(10)

    if (!recentRounds || recentRounds.length < 3) return

    const { data: profile } = await supabase
      .from('profiles')
      .select('name, indice')
      .eq('id', userId)
      .single()

    const prompt = `El jugador ${profile?.name || 'anónimo'} (índice: ${profile?.indice ?? 'desconocido'}) acaba de importar ${importedCount} rondas históricas.

Sus últimas rondas:
${recentRounds.map(r => `- ${r.course_name}: ${r.total_gross} golpes (${r.played_at})`).join('\n')}

Genera un análisis breve (máximo 3 oraciones) de lo que revelan estos datos importados sobre su juego. Sé específico y usa los números. Responde en español.`

    // Vía gateway central: fallback Anthropic→Gemini + logging a ai_usage.
    // Rol primary_chat = sonnet→haiku→gemini-flash (mantiene calidad sonnet
    // del modelo original y suma red de seguridad si Anthropic se satura).
    const llm = await callLLM({
      role: 'primary_chat',
      messages: [{ role: 'user', content: prompt }],
      maxTokens: 300,
      surface: 'import_insight',
      userId,
    })

    const insightText = llm.text.trim()
    if (!insightText) return

    // Store insight
    await supabase
      .from('taiger_sessions')
      .insert({
        user_id: userId,
        session_type: 'import_insight',
        messages: [
          { role: 'assistant', content: insightText },
        ],
        metadata: { source: 'import', imported_count: importedCount },
      })
  } catch (err) {
    // Non-blocking: el insight es accesorio. Si toda la cadena de IA cae
    // (Anthropic + Gemini) o falla la persistencia, NUNCA rompe la importación.
    void captureError(err, {
      context: err instanceof AllProvidersFailedError
        ? 'import.insights-all-providers-failed'
        : 'import.insights-generation-error',
      userId,
    })
  }
}

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

    // Perfil para re-resolver las tarjetas Garmin re-importadas IGUAL que la primera
    // importación (`resolverTarjetaImportada`): género, tee por defecto e índice del tope.
    const { data: perfilImport } = await supabase
      .from('profiles')
      .select(COLS_PERFIL_IMPORT)
      .eq('id', user.id)
      .maybeSingle()

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

    if (job.status === 'completed') {
      return NextResponse.json({ error: 'Este job ya fue completado' }, { status: 400 })
    }

    // Validación recalculada en el servidor: la del cliente queda vieja cuando el
    // usuario corrige un hoyo en la revisión (antes la tarjeta corregida se
    // descartaba en silencio). Las que no pasan se informan como error.
    const insertedIds: string[] = []
    // Duplicados Garmin re-escritos (UPDATE): se guardaron, pero no son nuevos.
    const updatedIds: string[] = []
    const insertErrors: Array<{ tempId: string; error: string }> = []
    const validRounds = selectedRounds.filter(r => {
      const v = validarRonda(r)
      if (!v.valid) insertErrors.push({ tempId: r.tempId, error: v.issues[0]?.message ?? 'Tarjeta incompleta' })
      return v.valid
    })
    const duplicates: Array<{ tempId: string; course: string; date: string }> = []

    // Step 1: Check duplicates in a single query
    const dupeChecks = validRounds.map(r => ({
      tempId: r.tempId,
      course: r.course_name,
      date: r.played_at.split('T')[0],
      gross: r.total_gross,
    }))

    const { data: existingRounds } = await supabase
      .from('historical_rounds')
      .select('course_name, played_at, total_gross')
      .eq('user_id', user.id)

    const existingSet = new Set(
      (existingRounds || []).map(r =>
        `${r.course_name}|${r.played_at}|${r.total_gross}`
      )
    )

    // Step 2: Preparar filas — filtrar duplicados, separar Garmin de no-Garmin

    // Garmin rounds que ya existen — UPDATE (columnas armadas por `actualizacionGarmin`).
    const garminUpdates: Array<{ tempId: string; garminId: string; update: Record<string, unknown> }> = []
    // Cancha y tee que esas filas YA tienen (el usuario pudo corregirlos en la app):
    // mandan sobre los del archivo al re-importar.
    // Si no se pueden leer, no se escribe nada (el job sigue abierto para reintentar).
    let filasGarmin: Awaited<ReturnType<typeof fetchFilasGarminExistentes>>
    try {
      filasGarmin = await fetchFilasGarminExistentes(
        supabase,
        user.id,
        validRounds
          .filter(r => r.metadata?.garmin_scorecard_id && r.metadata?.is_duplicate)
          .map(r => String(r.metadata!.garmin_scorecard_id)),
      )
    } catch (err) {
      void captureError(err, { context: 'import.confirm.filas-garmin', userId: user.id, meta: { jobId: job_id } })
      return NextResponse.json({ error: 'No pudimos leer tus tarjetas Garmin. Intenta de nuevo en un momento.' }, { status: 503 })
    }

    for (const round of validRounds) {
      // Golpes posicionales con el número real de cada hoyo (un back 9 es 10..18).
      const tarjeta = tarjetaDelImport(round.scores, round.par_per_hole)
      const scoresArray = tarjeta.scores
      const metadataRonda = metadataDelImport(round.metadata, tarjeta)

      if (scoresArray.length === 0) {
        insertErrors.push({ tempId: round.tempId, error: 'No se pudieron extraer scores' })
        continue
      }

      const garminId = round.metadata?.garmin_scorecard_id
      const importSource = round.metadata?.import_source || 'photo_scan'

      // Path Garmin — duplicado existente: hacer UPDATE en lugar de skip. El
      // diferencial se recalcula desde el gross ajustado (WHS 3.1, #545).
      if (garminId && round.metadata?.is_duplicate) {
        garminUpdates.push({
          tempId: round.tempId,
          garminId,
          update: await actualizacionGarmin(supabase, user.id, {
            ...round,
            scores: scoresArray,
            par_per_hole: tarjeta.parPerHole,
            holes_played: round.holes_played || scoresArray.length,
            import_confidence: round.import_confidence ?? 1.0,
            import_source: importSource,
            metadata: metadataRonda,
          }, perfilImport, filasGarmin.get(String(garminId)) ?? null),
        })
        continue
      }

      // Detección de duplicados estándar (no-Garmin)
      if (!garminId) {
        const dupeKey = `${round.course_name}|${round.played_at.split('T')[0]}|${round.total_gross}`
        if (existingSet.has(dupeKey)) {
          duplicates.push({ tempId: round.tempId, course: round.course_name, date: round.played_at })
          continue
        }
      }

      // Path no-Garmin: delegar a importRound() para resolución de cancha + par_per_hole
      // Trade-off: N inserts secuenciales en lugar de 1 batch. Aceptable para
      // tamaño típico de batches (1-10 rondas). El path Garmin sigue siendo batch.
      const importResult = await importRound(supabase, {
        userId: user.id,
        courseName: round.course_name,
        courseId: round.course_id ?? null,
        teeColor: round.tee_color ?? round.metadata?.tee_box ?? null,
        parPerHole: tarjeta.parPerHole,
        scores: scoresArray,
        playedAt: round.played_at,
        source: importSource as ImportSource,
        totalGross: round.total_gross,
        privacy: 'private',
        metadata: metadataRonda,
        formatoJuego: round.formato_juego ?? 'stroke_play',
        modoJuego: round.modo_juego ?? 'gross',
        holesPlayed: round.holes_played || scoresArray.length,
        importConfidence: round.import_confidence ?? 0.5,
      })

      if (!importResult.success) {
        insertErrors.push({ tempId: round.tempId, error: importResult.warnings.join('; ') })
      } else if (importResult.roundId) {
        insertedIds.push(importResult.roundId)
      }
    }

    // Step 3b: Update existing Garmin rounds (upsert by garmin_scorecard_id) — parallelized
    await Promise.all(
      garminUpdates.map(({ tempId, garminId, update }) =>
        supabase
          .from('historical_rounds')
          .update(update)
          .eq('user_id', user.id)
          .eq('garmin_scorecard_id', garminId)
          .select('id')
          .then(({ data: updated, error: updateError }) => {
            if (updateError) {
              insertErrors.push({ tempId, error: updateError.message })
            } else if (updated && updated.length > 0) {
              updatedIds.push(updated[0].id)
            } else {
              // Se borró entre el parseo y el confirm: sin esto no caía en ningún contador.
              insertErrors.push({ tempId, error: 'La ronda ya no existe en tu historial' })
            }
          })
      )
    )

    // Update job status. Con 0 guardadas el job queda abierto: el usuario puede
    // descartar la tarjeta que falló y reintentar (si no, "ya fue completado").
    if (insertedIds.length + updatedIds.length > 0) await supabase
      .from('import_jobs')
      .update({
        status: 'completed',
        // Misma definición que la respuesta: solo nuevas (las re-escritas van aparte).
        total_imported: insertedIds.length,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', job_id)

    // Recalculate CPI
    let cpiResult = null
    try {
      // Las mismas rondas que /perfil, /api/cpi y /coach (`fetchRondasCPI`).
      const rondasCPI = await fetchRondasCPI(supabase, user.id)

      if (rondasCPI && rondasCPI.length >= 3) {
        cpiResult = calcularCPI(rondasCPI)

        // cpi_* es un caché computado: no editable por el usuario (REVOKE 01-oct-2026),
        // se escribe con service role tras calcularlo acá.
        const { error: cpiErr } = await createAdminClient()
          .from('profiles')
          .update({
            cpi_score: cpiResult.score,
            cpi_trend: cpiResult.trend,
            cpi_status: cpiResult.status,
            cpi_updated_at: new Date().toISOString(),
          })
          .eq('id', user.id)
        if (cpiErr) void captureError(cpiErr, { context: 'import.cpi-cache-update', userId: user.id })
      }
    } catch (err) {
      void captureError(err, { context: 'import.cpi-recalc-error' })
    }

    // Recalculate Índice Golfers+ and nivel (async, don't block)
    supabase.rpc('calcular_indice_golfers', { p_user_id: user.id }).then(() => {})

    const hace90Dias = new Date()
    hace90Dias.setDate(hace90Dias.getDate() - 90)
    supabase
      .from('historical_rounds')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('played_at', hace90Dias.toISOString())
      .then(({ count }: { count: number | null }) => {
        const nuevoNivel = calcularNivel(count ?? 0)
        const expira = new Date()
        expira.setDate(expira.getDate() + 60)
        supabase.from('profiles').update({
          nivel: nuevoNivel,
          nivel_updated_at: new Date().toISOString(),
          nivel_expires_at: expira.toISOString(),
        }).eq('id', user.id).then(() => {})
      })

    // Generate tAIger+ insights (async, don't block)
    generarInsights(user.id, insertedIds.length, supabase).catch(() => {})

    // Detectar patrones automáticamente post-importación (non-blocking)
    detectAndSavePatterns(supabase, user.id).catch(() => {})

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
