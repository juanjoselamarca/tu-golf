/**
 * Import Round — Golfers+
 * Centraliza la lógica de importar/crear rondas históricas.
 * Usado por: importación manual, ronda libre finalizada, futuro photo scan, Garmin.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveCourse } from '@/lib/resolve-course'
import { resolveTeeRatingsForCourse } from '@/lib/data/course-tees'
import { calcularDiferencial } from '@/lib/indice-golfers'

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
  totalStableford: number | null
  warnings: string[]
}

/**
 * Importa una ronda histórica con validación y cálculos automáticos.
 *
 * - Valida scores (no negativos, warning si > par+6)
 * - Calcula total_gross si no se pasa
 * - Calcula total_neto si el usuario tiene índice
 * - Calcula total_stableford si hay datos de par por hoyo
 * - Vincula course_id automáticamente si hay match por nombre
 * - NO bloquea por scores altos — solo warning
 */
export async function importRound(
  supabase: SupabaseClient,
  input: ImportRoundInput
): Promise<ImportRoundResult> {
  const warnings: string[] = []

  // ── Validación de scores ──────────────────────────────────
  if (input.scores.length !== 9 && input.scores.length !== 18) {
    return { success: false, totalGross: 0, totalNeto: null, totalStableford: null, warnings: ['Scores debe tener 9 o 18 valores'] }
  }

  for (let i = 0; i < input.scores.length; i++) {
    const s = input.scores[i]
    if (s < 1) {
      return { success: false, totalGross: 0, totalNeto: null, totalStableford: null, warnings: [`Hoyo ${i + 1}: score no puede ser menor a 1`] }
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

  // ── Resolver course (vincular + opcionalmente crear/enriquecer) ──
  let courseId = input.courseId || null
  if (!courseId && input.courseName) {
    const resolveResult = await resolveCourse({
      supabase,
      courseName: input.courseName,
      parPerHole: input.parPerHole ?? null,
    })
    courseId = resolveResult.courseId
    warnings.push(...resolveResult.warnings)
  }

  // ── Determinar par_per_hole final ──
  // Prioridad: 1) input.parPerHole (OCR) → 2) course_holes lookup → 3) null
  let finalParPerHole: Record<string, number> | null = input.parPerHole ?? null
  if (!finalParPerHole && courseId) {
    const { data: holes } = await supabase
      .from('course_holes')
      .select('numero, par')
      .eq('course_id', courseId)
      .order('numero')
    if (holes && holes.length > 0) {
      finalParPerHole = Object.fromEntries(holes.map(h => [String(h.numero), h.par]))
    }
  }

  // ── Calcular neto (si hay índice del usuario) ─────────────
  let totalNeto: number | null = null
  const { data: profile } = await supabase
    .from('profiles')
    .select('indice, default_tee_color')
    .eq('id', input.userId)
    .single()

  if (profile?.indice != null) {
    // Validate handicap index — negative values are invalid per USGA/R&A rules
    if (profile.indice < 0) {
      warnings.push(`Indice de handicap negativo (${profile.indice}) — usando 0 para cálculo neto`)
    }
    const safeIndice = Math.max(0, profile.indice)
    totalNeto = totalGross - safeIndice
  }

  // ── Calcular stableford (si hay pares por hoyo) ───────────
  let totalStableford: number | null = null
  if (courseId && profile?.indice != null) {
    const { data: holes } = await supabase
      .from('course_holes')
      .select('numero, par, stroke_index')
      .eq('course_id', courseId)
      .order('numero')

    if (holes && holes.length === input.scores.length) {
      const hcp = Math.max(0, Math.round(profile.indice))
      let sf = 0
      for (let i = 0; i < input.scores.length; i++) {
        const par = holes[i].par
        const si = holes[i].stroke_index ?? (i + 1)
        const strokesBase = Math.floor(hcp / 18)
        const extra = (hcp % 18) >= si ? 1 : 0
        const strokes = strokesBase + extra
        const neto = input.scores[i] - strokes
        const diff = neto - par
        if (diff <= -2) sf += 4
        else if (diff === -1) sf += 3
        else if (diff === 0) sf += 2
        else if (diff === 1) sf += 1
        // else 0
      }
      totalStableford = sf
    }
  }

  // ── Resolver CR/slope reales desde el catálogo (course_tees) ──
  // Raíz del índice corrupto: tomar el rating del archivo en vez del tee real.
  // Solo cuando hay cancha vinculada + color de tee. Sin match confiable → null
  // (no se inventa rating; la ronda no aporta diferencial al índice).
  // Si la tarjeta no trae tee (foto/manual sin tee), caer al default del usuario
  // (preguntado una sola vez). Así una tarjeta sin tee igual resuelve su CR/slope.
  const effectiveTee = input.teeColor || profile?.default_tee_color || null
  let courseRating: number | null = null
  let slopeRating: number | null = null
  let diferencial: number | null = null
  if (courseId && effectiveTee) {
    const resolved = await resolveTeeRatingsForCourse(
      supabase,
      courseId,
      effectiveTee,
      input.holesPlayed ?? input.scores.length,
    )
    if (resolved) {
      courseRating = resolved.cr
      slopeRating = resolved.slope
      diferencial = calcularDiferencial(
        totalGross,
        resolved.cr,
        resolved.slope,
        input.holesPlayed ?? input.scores.length,
        resolved.nineHoleRatings,
      )
    }
  }

  // ── Insertar ──────────────────────────────────────────────
  const { data: inserted, error } = await supabase
    .from('historical_rounds')
    .insert({
      user_id: input.userId,
      course_name: input.courseName,
      course_id: courseId,
      tee_color: effectiveTee,
      course_rating: courseRating,
      slope_rating: slopeRating,
      diferencial,
      par_per_hole: finalParPerHole,
      played_at: input.playedAt,
      scores: input.scores,
      total_gross: totalGross,
      total_neto: totalNeto,
      total_stableford: totalStableford,
      notes: input.notes || null,
      privacy: input.privacy || 'private',
      // La columna de la tabla es `import_source`, NO `source`. Escribir `source`
      // hacía fallar TODO insert con 42703 → 0 rondas importadas (bug P0, jun-2026).
      import_source: input.source,
      metadata: input.metadata || {},
      formato_juego: (input.formatoJuego as 'stroke_play' | 'stableford' | 'match_play' | 'best_ball' | 'scramble' | 'foursome') ?? 'stroke_play',
      modo_juego: (input.modoJuego as 'gross' | 'neto') ?? 'gross',
      holes_played: input.holesPlayed ?? input.scores.length,
      import_confidence: input.importConfidence ?? null,
    })
    .select('id')
    .single()

  if (error) {
    return {
      success: false,
      totalGross,
      totalNeto,
      totalStableford,
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
    totalStableford,
    warnings,
  }
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
