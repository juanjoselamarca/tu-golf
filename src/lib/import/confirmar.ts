// Lo que hace /api/import/confirm una vez validado el pedido: guarda las tarjetas elegidas y
// recalcula lo que depende del historial (CPI, índice, nivel, insight y patrones del coach).

import type { SupabaseClient } from '@supabase/supabase-js'
import { calcularCPI, validarRonda, type ResultadoCPI } from '@/golf/stats/cpi'
import { calcularNivel } from '@/lib/indice-golfers'
import { detectAndSavePatterns } from '@/golf/coach/detect-and-save-patterns'
import type { ImportRoundData } from '@/lib/import-types'
import { importRound, metadataDelImport, tarjetaDelImport, type ImportSource } from '@/lib/import-round'
import { actualizacionGarmin, fetchFilasGarminExistentes } from '@/lib/data/import-garmin'
import { COLS_PERFIL_IMPORT } from '@/lib/data/import-tarjeta'
import { fetchRondasCPI } from '@/lib/data/perfil'
import { callLLM, AllProvidersFailedError } from '@/lib/ai'
import { captureError } from '@/lib/error-tracking'
import { createAdminClient } from '@/lib/supabaseAdmin'

export interface TarjetasGuardadas {
  insertedIds: string[]
  /** Duplicados Garmin re-escritos (UPDATE): se guardaron, pero no son nuevos. */
  updatedIds: string[]
  errors: Array<{ tempId: string; error: string }>
  duplicates: Array<{ tempId: string; course: string; date: string }>
}

/** No se pudieron leer las tarjetas Garmin ya guardadas: no se escribió nada (el job sigue abierto para reintentar). */
export class LecturaGarminError extends Error {
  constructor(readonly causa: unknown) {
    super('No se pudieron leer las tarjetas Garmin existentes')
  }
}

export async function guardarTarjetasImportadas(
  supabase: SupabaseClient,
  userId: string,
  selectedRounds: ImportRoundData[],
): Promise<TarjetasGuardadas> {
  // Perfil para re-resolver las tarjetas Garmin re-importadas IGUAL que la primera
  // importación (`resolverTarjetaImportada`): género, tee por defecto e índice del tope.
  const { data: perfilImport } = await supabase
    .from('profiles')
    .select(COLS_PERFIL_IMPORT)
    .eq('id', userId)
    .maybeSingle()

  // Validación recalculada en el servidor: la del cliente queda vieja cuando el
  // usuario corrige un hoyo en la revisión (antes la tarjeta corregida se
  // descartaba en silencio). Las que no pasan se informan como error.
  const insertedIds: string[] = []
  const updatedIds: string[] = []
  const insertErrors: TarjetasGuardadas['errors'] = []
  const validRounds = selectedRounds.filter(r => {
    const v = validarRonda(r)
    if (!v.valid) insertErrors.push({ tempId: r.tempId, error: v.issues[0]?.message ?? 'Tarjeta incompleta' })
    return v.valid
  })
  const duplicates: TarjetasGuardadas['duplicates'] = []

  const { data: existingRounds } = await supabase
    .from('historical_rounds')
    .select('course_name, played_at, total_gross')
    .eq('user_id', userId)

  const existingSet = new Set(
    (existingRounds || []).map(r =>
      `${r.course_name}|${r.played_at}|${r.total_gross}`
    )
  )

  // Tarjetas Garmin del lote que YA están en el historial: se re-escriben en vez de insertarse.
  // Lo dice la base al confirmar, no la marca del parseo: un reintento tras un corte ya guardó parte del lote.
  // Su cancha y tee (el usuario pudo corregirlos en la app) mandan sobre los del archivo.
  let filasGarmin: Awaited<ReturnType<typeof fetchFilasGarminExistentes>>
  try {
    filasGarmin = await fetchFilasGarminExistentes(
      supabase,
      userId,
      validRounds
        .filter(r => r.metadata?.garmin_scorecard_id)
        .map(r => String(r.metadata!.garmin_scorecard_id)),
    )
  } catch (err) {
    throw new LecturaGarminError(err)
  }

  // En orden de juego, como si se hubieran entregado una a una: cada ronda se topa con el
  // índice que daban las anteriores, también las de este lote (`indiceDelDia`).
  for (const round of [...validRounds].sort((a, b) => a.played_at.localeCompare(b.played_at))) {
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
    // diferencial se recalcula desde el gross ajustado (WHS 3.1, #545). Se escribe
    // antes de seguir: las rondas posteriores del lote se topan con este diferencial.
    const existente = garminId ? filasGarmin.get(String(garminId)) : undefined
    if (garminId && existente) {
      const update = await actualizacionGarmin(supabase, userId, {
        ...round,
        scores: scoresArray,
        par_per_hole: tarjeta.parPerHole,
        holes_played: round.holes_played || scoresArray.length,
        import_confidence: round.import_confidence ?? 1.0,
        import_source: importSource,
        metadata: metadataRonda,
      }, perfilImport, existente)
      const { data: updated, error: updateError } = await supabase
        .from('historical_rounds')
        .update(update)
        .eq('user_id', userId)
        .eq('garmin_scorecard_id', garminId)
        .select('id')
      if (updateError) insertErrors.push({ tempId: round.tempId, error: updateError.message })
      else if (updated && updated.length > 0) updatedIds.push(updated[0].id)
      // Se borró entre la lectura y el UPDATE: sin esto no caía en ningún contador.
      else insertErrors.push({ tempId: round.tempId, error: 'La ronda ya no existe en tu historial' })
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
    // tamaño típico de batches (1-10 rondas).
    const importResult = await importRound(supabase, {
      userId,
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
      garminScorecardId: garminId ? String(garminId) : null,
    })

    if (importResult.duplicada) {
      duplicates.push({ tempId: round.tempId, course: round.course_name, date: round.played_at })
    } else if (!importResult.success) {
      insertErrors.push({ tempId: round.tempId, error: importResult.warnings.join('; ') })
    } else if (importResult.roundId) {
      insertedIds.push(importResult.roundId)
    }
  }

  return { insertedIds, updatedIds, errors: insertErrors, duplicates }
}

/** CPI (se espera: va en la respuesta); índice, nivel, insight y patrones quedan corriendo sin bloquear. */
export async function recalcularTrasImportar(
  supabase: SupabaseClient,
  userId: string,
  importadas: number,
): Promise<ResultadoCPI | null> {
  let cpiResult: ResultadoCPI | null = null
  try {
    // Las mismas rondas que /perfil, /api/cpi y /coach (`fetchRondasCPI`).
    const rondasCPI = await fetchRondasCPI(supabase, userId)

    if (rondasCPI) {
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
        .eq('id', userId)
      if (cpiErr) void captureError(cpiErr, { context: 'import.cpi-cache-update', userId })
    }
  } catch (err) {
    void captureError(err, { context: 'import.cpi-recalc-error' })
  }

  supabase.rpc('calcular_indice_golfers', { p_user_id: userId }).then(() => {})

  const hace90Dias = new Date()
  hace90Dias.setDate(hace90Dias.getDate() - 90)
  supabase
    .from('historical_rounds')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .gte('played_at', hace90Dias.toISOString())
    .then(({ count }: { count: number | null }) => {
      const nuevoNivel = calcularNivel(count ?? 0)
      const expira = new Date()
      expira.setDate(expira.getDate() + 60)
      supabase.from('profiles').update({
        nivel: nuevoNivel,
        nivel_updated_at: new Date().toISOString(),
        nivel_expires_at: expira.toISOString(),
      }).eq('id', userId).then(() => {})
    })

  generarInsights(supabase, userId, importadas).catch(() => {})

  detectAndSavePatterns(supabase, userId).catch(() => {})

  return cpiResult
}

async function generarInsights(supabase: SupabaseClient, userId: string, importedCount: number): Promise<void> {
  try {
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
