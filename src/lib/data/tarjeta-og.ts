// ─── Capa de datos para el metadata/OG de la tarjeta pública ────────────────
// Usada por `tarjeta/[id]/layout.tsx` (generateMetadata). Acepta el client de
// Supabase ya creado (server client en SSR) para no acoplar el layout a
// `supabase.from(...)` directo (regla "el que toca, ordena").
//
// Calcula el vs-par contra el par REAL de la ronda (snapshot `par_per_hole`),
// no contra el par fijo 36/72 — vía `resolveParTotal` (fuente única en
// `src/golf/share/vs-par.ts`).

import type { SupabaseClient } from '@supabase/supabase-js'
import { inferHoles, type ParPerHoleInput } from '@/golf/core/holes'
import { resolveParTotal, computeVsParGross, formatVsParLabel } from '@/golf/share/vs-par'

export interface TarjetaOgData {
  playerName: string
  gross: number
  holesPlayed: number
  courseName: string
  /** Etiqueta vs-par contra par real: `'Par'`, `'+3'`, `'-2'`. */
  vsParLabel: string
}

export async function loadTarjetaOgData(
  id: string,
  supabase: SupabaseClient,
): Promise<TarjetaOgData | null> {
  const { data: round } = await supabase
    .from('historical_rounds')
    .select('total_gross, course_name, holes_played, user_id, par_per_hole, scores')
    .eq('id', id)
    .single()

  if (!round) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('name')
    .eq('id', round.user_id)
    .single()

  const gross = round.total_gross ?? 0

  // Un solo `holesPlayed` (fuente única): se infiere de holes_played o, si está
  // ausente (~68% de rondas viejas), del `scores`. El MISMO valor alimenta el par
  // y el texto de hoyos, para que nunca se contradigan (vs-par vs "N hoyos").
  const holesPlayed = inferHoles({ holes_played: round.holes_played, scores: round.scores }) ?? 18
  const { parTotal } = resolveParTotal({
    holesPlayed,
    parPerHole: round.par_per_hole as ParPerHoleInput,
  })

  return {
    playerName: profile?.name ?? 'Jugador',
    gross,
    holesPlayed,
    courseName: round.course_name,
    vsParLabel: formatVsParLabel(computeVsParGross(gross, parTotal)),
  }
}
