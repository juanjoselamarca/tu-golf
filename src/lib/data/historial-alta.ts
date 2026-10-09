// ─── Capa de datos — agregar a mano una ronda al historial ──────────────────
//
// Antes `useAddRoundForm` resolvía la cancha, los ratings y el diferencial desde
// el hook (supabase.from en src/app) y llamaba `calcularDiferencial` sin decirle
// cuántos hoyos se jugaron: una ronda de 9 con bruto > 55 se calculaba con la
// fórmula de 18 (un 58 en 9 hoyos daba ≈ −12 con CR 72 / slope 130) y una
// tarjeta de 10–17 hoyos también (un 74 en 17 hoyos daba −0,9). Un solo dato así basta para hundir el
// índice: con 3–6 rondas se promedia el MEJOR diferencial.
//
// Ahora usa las fuentes del cierre de ronda libre: `fetchRatingsDelTee` (tee de
// la fila, fallback a la cancha y rating publicado de la mitad de 9) y
// `diferencialDeTarjeta` (WHS 2.2: 9 hoyos completos o tarjeta de 18).

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { diferencialDeTarjeta } from '@/lib/indice-golfers'
import { fetchRatingsDelTee } from './ronda-libre-finalizar'

type Client = Pick<SupabaseClient, 'from' | 'rpc'>

export interface RondaManualInput {
  userId: string
  courseName: string
  teeColor: string | null
  /** YYYY-MM-DD */
  playedAt: string
  /** 18 casillas por número de hoyo (índice 0 = hoyo 1); null = sin score. */
  scores: (number | null)[]
  totalGross: number | null
  notes: string | null
  privacy: string
}

/** Fila de `historical_rounds` para una ronda cargada a mano. */
export async function filaRondaManual(supabase: Client, input: RondaManualInput) {
  let courseId: string | null = null
  if (input.courseName) {
    const { data } = await supabase
      .from('courses')
      .select('id')
      .ilike('nombre', input.courseName)
      .limit(1)
      .single()
    courseId = (data?.id as string | undefined) ?? null
  }

  // Número de hoyo (1..18) de cada casilla con score real.
  const hoyosJugados = input.scores.flatMap((s, i) => (s != null ? [i + 1] : []))
  const ratings = await fetchRatingsDelTee(supabase, courseId, input.teeColor, hoyosJugados)
  const diferencial = input.totalGross
    ? diferencialDeTarjeta({
        totalGross: input.totalGross,
        holesPlayed: hoyosJugados.length,
        ratings,
        bolaCompartida: false,
      })
    : null

  return {
    user_id: input.userId,
    course_name: input.courseName,
    course_id: courseId,
    tee_color: input.teeColor,
    played_at: input.playedAt,
    scores: input.scores,
    total_gross: input.totalGross,
    // holes_played es NOT NULL — hoyos con score real.
    holes_played: hoyosJugados.length || 18,
    notes: input.notes,
    privacy: input.privacy,
    slope_rating: ratings.slope,
    course_rating: ratings.cr,
    diferencial,
  }
}

export async function agregarRondaManual(
  supabase: Client,
  input: RondaManualInput,
): Promise<{ error: PostgrestError | null }> {
  const fila = await filaRondaManual(supabase, input)
  const { error } = await supabase.from('historical_rounds').insert(fila)
  return { error }
}
