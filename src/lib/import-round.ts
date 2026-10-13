/**
 * Import Round — Golfers+
 * Centraliza la lógica de importar/crear rondas históricas.
 * Usado por: ronda manual del historial, foto, Garmin, CSV.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { esTarjetaAMedias, MIN_HOYOS_JUGADOS_SCORE_9 } from '@/golf/core/ajuste-whs'
import { metadataConAjusteWHS } from '@/lib/data/ajuste-whs-fila'
import { COLS_PERFIL_IMPORT, resolverTarjetaImportada } from '@/lib/data/import-tarjeta'

export type ImportSource = 'manual' | 'ronda_libre' | 'photo_scan' | 'garmin' | 'csv' | 'import'

export interface ImportRoundInput {
  userId: string
  courseName: string
  courseId?: string | null
  teeColor?: string | null
  parPerHole?: Record<string, number> | null
  playedAt: string               // YYYY-MM-DD
  scores: number[]               // array de 9 o 18 scores (gross)
  totalGross?: number | null     // si no se pasa, se calcula de scores
  notes?: string | null
  privacy?: 'public' | 'private'
  source: ImportSource
  metadata?: {
    putts?: number[]             // putts por hoyo
    gir?: boolean[]              // green in regulation por hoyo
    fairways?: boolean[]         // fairway hit por hoyo
    penalties?: number[]         // penalties por hoyo
    /** Número real de hoyo de cada posición de `scores` (p. ej. 10..18 en un back 9). */
    hoyos?: number[]
    [key: string]: unknown
  }
  // Campos opcionales para importación vía confirm/route (anteriormente hardcoded)
  formatoJuego?: 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome' | string
  modoJuego?: 'gross' | 'neto' | string
  holesPlayed?: number
  importConfidence?: number
}

export interface ImportRoundResult {
  success: boolean
  roundId?: string
  totalGross: number
  totalNeto: number | null
  warnings: string[]
}

/**
 * Importa una ronda histórica con validación y cálculos automáticos.
 *
 * - Valida scores (no negativos, warning si > 15)
 * - Calcula total_gross si no se pasa
 * - Calcula total_neto si el usuario tiene índice
 * - Vincula course_id automáticamente si hay match por nombre
 * - Diferencial desde el Adjusted Gross Score (WHS 3.1, `grossAjustadoDeFila`)
 *   de la MISMA fila que se inserta y con los MISMOS ratings (#545)
 * - NO bloquea por scores altos — solo warning
 */
export async function importRound(
  supabase: SupabaseClient,
  input: ImportRoundInput
): Promise<ImportRoundResult> {
  const warnings: string[] = []

  // ── Validación de scores ──────────────────────────────────
  if (input.scores.length !== 9 && input.scores.length !== 18) {
    return { success: false, totalGross: 0, totalNeto: null, warnings: ['Scores debe tener 9 o 18 valores'] }
  }

  for (let i = 0; i < input.scores.length; i++) {
    const s = input.scores[i]
    if (s < 1) {
      return { success: false, totalGross: 0, totalNeto: null, warnings: [`Hoyo ${i + 1}: score no puede ser menor a 1`] }
    }
    if (s > 15) {
      warnings.push(`Hoyo ${i + 1}: score de ${s} — ¿es correcto?`)
    }
  }

  // ── Calcular totales ──────────────────────────────────────
  const totalGross = input.totalGross ?? input.scores.reduce((a, b) => a + b, 0)

  // Verificar consistencia
  const sumScores = input.scores.reduce((a, b) => a + b, 0)
  if (input.totalGross && Math.abs(input.totalGross - sumScores) > 0) {
    warnings.push(`Total gross (${input.totalGross}) no coincide con suma de scores (${sumScores})`)
  }

  // Perfil del usuario (género para desambiguar cancha, índice/tee para neto e
  // índice para el tope WHS 3.1).
  const { data: profile } = await supabase
    .from('profiles')
    .select(COLS_PERFIL_IMPORT)
    .eq('id', input.userId)
    .single()

  // ── Calcular neto (si hay índice del usuario) ─────────────
  let totalNeto: number | null = null
  if (profile?.indice != null) {
    // Validate handicap index — negative values are invalid per USGA/R&A rules
    if (profile.indice < 0) {
      warnings.push(`Indice de handicap negativo (${profile.indice}) — usando 0 para cálculo neto`)
    }
    const safeIndice = Math.max(0, profile.indice)
    totalNeto = totalGross - safeIndice
  }

  // ── Cancha, tee, CR/slope, Adjusted Gross Score (WHS 3.1) y diferencial ──
  // Fuente única con la re-importación Garmin (`resolverTarjetaImportada`): CR/slope
  // sólo del catálogo (nunca del archivo), tee por defecto del usuario si la tarjeta
  // no trae, tope y diferencial de la MISMA fila y los MISMOS ratings.
  const formatoJuego = (input.formatoJuego as 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome') ?? 'stroke_play'
  const metadataBase = input.metadata || {}
  const holesPlayed = input.holesPlayed ?? input.scores.length
  const { courseId, tee: effectiveTee, parPerHole: finalParPerHole, ratings: resolved, ajuste, diferencial, warnings: avisosCancha } =
    await resolverTarjetaImportada(supabase, {
      userId: input.userId,
      courseName: input.courseName,
      courseId: input.courseId,
      teeColor: input.teeColor,
      parPerHole: input.parPerHole,
      scores: input.scores,
      totalGross,
      holesPlayed,
      metadata: metadataBase,
      formatoJuego,
      source: input.source,
    }, profile)
  warnings.push(...avisosCancha)

  // ── Insertar ──────────────────────────────────────────────
  const { data: inserted, error } = await supabase
    .from('historical_rounds')
    .insert({
      user_id: input.userId,
      course_name: input.courseName,
      course_id: courseId,
      tee_color: effectiveTee,
      course_rating: resolved?.cr ?? null,
      slope_rating: resolved?.slope ?? null,
      diferencial,
      adjusted_gross: ajuste?.grossAjustado ?? null,
      par_per_hole: finalParPerHole,
      played_at: input.playedAt,
      scores: input.scores,
      total_gross: totalGross,
      total_neto: totalNeto,
      notes: input.notes || null,
      privacy: input.privacy || 'private',
      // La columna de la tabla es `import_source`, NO `source`. Escribir `source`
      // hacía fallar TODO insert con 42703 → 0 rondas importadas (bug P0, jun-2026).
      import_source: input.source,
      metadata: metadataConAjusteWHS(metadataBase, ajuste),
      formato_juego: formatoJuego,
      modo_juego: (input.modoJuego as 'gross' | 'neto') ?? 'gross',
      holes_played: holesPlayed,
      import_confidence: input.importConfidence ?? null,
    })
    .select('id')
    .single()

  if (error) {
    return {
      success: false,
      totalGross,
      totalNeto,
      warnings: [`Error al guardar: ${error.message}`],
    }
  }

  // ── Trigger recalc de patterns (si tiene 5+ rondas) ───────
  const { count: roundCount } = await supabase
    .from('historical_rounds')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', input.userId)

  if ((roundCount || 0) >= 5) {
    // Mark profile for pattern recalculation
    await supabase
      .from('profiles')
      .update({ patterns_need_recalc: true })
      .eq('id', input.userId)
  }

  return {
    success: true,
    roundId: inserted?.id,
    totalGross,
    totalNeto,
    warnings,
  }
}

/**
 * Tarjeta de la ronda manual del historial (18 casillas, vacías = hoyo sin
 * score) en la forma que acepta `importRound`: las 18, o exactamente 9 con su
 * número real de hoyo (`hoyos`, p. ej. 10..18 en un back 9). Con 10 a 17 hoyos
 * → `null`: WHS pide completar los no jugados con par neto (Regla 3.3) y una
 * tarjeta a medias daría un diferencial más bajo que el real. La regla es la
 * canónica del diferencial (`esTarjetaAMedias`, mínimo de un score de 9); nueve
 * hoyos de las dos mitades se guardan, pero `diferencialDeTarjeta` no les da
 * diferencial (`esScoreDe9Disperso`).
 */
export function tarjetaDelFormularioManual(
  casillas: ReadonlyArray<number | null>,
): { scores: number[]; hoyos: number[] } | null {
  const jugadas = casillas
    .map((s, i) => ({ s, hoyo: i + 1 }))
    .filter((c): c is { s: number; hoyo: number } => typeof c.s === 'number' && c.s >= 1)
  if (jugadas.length < MIN_HOYOS_JUGADOS_SCORE_9 || esTarjetaAMedias(jugadas.length)) return null
  return { scores: jugadas.map(c => c.s), hoyos: jugadas.map(c => c.hoyo) }
}


/**
 * Tarjeta de un import (foto, CSV, Garmin, FIT) en la forma posicional que guarda
 * `historical_rounds`: los golpes por hoyo vienen como `{ "<número real>": golpes }`
 * y `validarRonda` acepta cualquier juego de 9 o 18 números (un back 9 es 10..18).
 * Antes el confirm leía sólo las claves 1..N: un back 9 quedaba sin golpes y nueve
 * hoyos de las dos mitades se compactaban a posiciones 1..k sin decir cuáles eran
 * (ciego a `esScoreDe9Disperso`). Ahora:
 * - `scores`: los golpes en orden de número de hoyo;
 * - `hoyos`: el número real de cada posición (va a `metadata.hoyos`), o null si es
 *   1..N (la lectura posicional ya es la correcta y la fila queda como antes);
 * - `parPerHole`: posicional; si el par del import viene por número real (cubre
 *   todos los hoyos de la tarjeta) se re-numera, si no se deja como vino.
 */
export function tarjetaDelImport(
  scoresPorHoyo: Readonly<Record<string, number | null | undefined>>,
  parPerHole: Readonly<Record<string, number>> | null | undefined,
): { scores: number[]; hoyos: number[] | null; parPerHole: Record<string, number> | null } {
  const jugados = Object.entries(scoresPorHoyo)
    .map(([k, s]) => ({ hoyo: Number(k), s }))
    .filter((c): c is { hoyo: number; s: number } =>
      Number.isInteger(c.hoyo) && c.hoyo >= 1 && typeof c.s === 'number' && Number.isFinite(c.s) && c.s >= 1)
    .sort((a, b) => a.hoyo - b.hoyo)
  const numeros = jugados.map(c => c.hoyo)
  const esDesdeElUno = numeros.every((h, i) => h === i + 1)
  const parPorNumero = !esDesdeElUno && parPerHole != null && numeros.every(h => typeof parPerHole[String(h)] === 'number')
  return {
    scores: jugados.map(c => c.s),
    hoyos: esDesdeElUno ? null : numeros,
    parPerHole: parPorNumero
      ? Object.fromEntries(numeros.map((h, i) => [String(i + 1), parPerHole![String(h)]]))
      : (parPerHole ? { ...parPerHole } : null),
  }
}

/**
 * Claves de `metadata` que escribe SÓLO el servidor y que el motor del índice lee:
 * - `hoyos`: número real de cada posición (`tarjetaDelImport`);
 * - `ajuste_whs`: índice y CH con que se topó la tarjeta (`ajustePrevio` lo reusa);
 * - `estimados`: hoyos no jugados (bajan los hoyos jugados del diferencial);
 * - `ronda_libre_jugador_id`: marca de ronda en vivo (par del catálogo; índice único).
 * Un import que las traiga del cliente elegiría su propio tope o diferencial.
 */
export const CLAVES_METADATA_DEL_SERVIDOR = ['hoyos', 'ajuste_whs', 'estimados', 'ronda_libre_jugador_id'] as const

/**
 * `metadata` de la fila importada: la del cliente sin `CLAVES_METADATA_DEL_SERVIDOR`,
 * más el `hoyos` que decide el servidor (desde las claves de los golpes).
 */
export function metadataDelImport(
  metadataCliente: Readonly<Record<string, unknown>> | null | undefined,
  tarjeta: { hoyos: number[] | null },
): Record<string, unknown> {
  const resto: Record<string, unknown> = { ...(metadataCliente ?? {}) }
  for (const k of CLAVES_METADATA_DEL_SERVIDOR) delete resto[k]
  return { ...resto, ...(tarjeta.hoyos ? { hoyos: tarjeta.hoyos } : {}) }
}

/**
 * Tipos para la UI de importación
 */
export interface ImportFormData {
  courseName: string
  courseId: string | null
  teeColor: string
  date: string
  scores: (number | null)[]     // null = hoyo no llenado aún
  notes: string
}

/**
 * Valida un formulario de importación antes de enviar.
 * Retorna array de errores (vacío = válido).
 */
export function validateImportForm(data: ImportFormData, holes: number): string[] {
  const errors: string[] = []

  if (!data.courseName.trim()) errors.push('Selecciona una cancha')
  if (!data.date) errors.push('Selecciona la fecha')

  const filledScores = data.scores.filter(s => s !== null)
  if (filledScores.length === 0) errors.push('Ingresa al menos un score')

  if (filledScores.length < holes) {
    // Not all holes filled — warn but don't block
    // Some users might only play 9 holes on an 18-hole course
  }

  for (let i = 0; i < data.scores.length; i++) {
    const s = data.scores[i]
    if (s !== null && s < 1) {
      errors.push(`Hoyo ${i + 1}: score no puede ser 0 o negativo`)
    }
  }

  return errors
}
