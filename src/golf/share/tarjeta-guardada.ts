// ─── Vista de la tarjeta de una ronda guardada ──────────────────────────────
// Lo que pintan `/perfil/historial/[id]` y `/tarjeta/[id]` a partir de la ronda
// y del catálogo. Antes cada página lo armaba por su cuenta: hoyos sólo del
// catálogo (ignorando el par de la ronda), `holes_played ?? 18` en vez de
// inferirlo como el preview del link, y el vs-par formateado a mano dos veces.
//
// Puro: sin DOM, sin React, sin Supabase.

import { inferHoles, type HoleCountInput, type ParPerHoleInput } from '@/golf/core/holes'
import { hoyosDeLaTarjeta, parDeLaTarjeta, type HoyoDeCatalogo } from '@/golf/courses/vueltas'
import { computeVsParGross, formatVsParLabel } from './vs-par'

export interface RondaParaTarjeta {
  holes_played: number | null
  /** Arreglo (`scores[0]` = hoyo 1). Las cuentas demo lo guardan como objeto `{"1":4,…}`. */
  scores: (number | null)[] | Record<string, number | null> | null
  par_per_hole: ParPerHoleInput
  total_gross: number | null
}

export interface VistaDeTarjeta {
  /** Hoyos jugados: los mismos que usa el preview del link (`inferHoles`). */
  totalHoles: number
  hoyos: Array<{ numero: number; par: number | null; stroke_index: number }>
  /** Golpes por número de hoyo (`scores[0]` = hoyo 1); los hoyos sin golpe no van. */
  golpes: Record<string, number>
  /** `'Par'`, `'+3'`, `'-2'`; vacío si falta el par de algún hoyo o el gross. */
  vsParLabel: string
}

export function armarVistaDeTarjeta(ronda: RondaParaTarjeta, catalogo: HoyoDeCatalogo[]): VistaDeTarjeta {
  const totalHoles = inferHoles({
    holes_played: ronda.holes_played,
    scores: ronda.scores as HoleCountInput['scores'],
  }) ?? 18
  const hoyos = hoyosDeLaTarjeta(catalogo, totalHoles, ronda.par_per_hole)

  const golpes: Record<string, number> = {}
  const porHoyo: Array<[string, unknown]> = Array.isArray(ronda.scores)
    ? ronda.scores.map((s, i) => [String(i + 1), s])
    : Object.entries(ronda.scores ?? {})
  for (const [hoyo, s] of porHoyo) {
    if (typeof s === 'number' && s > 0) golpes[hoyo] = s
  }

  const par = parDeLaTarjeta(hoyos)
  const vsParLabel = ronda.total_gross != null && par != null
    ? formatVsParLabel(computeVsParGross(ronda.total_gross, par))
    : ''

  return { totalHoles, hoyos, golpes, vsParLabel }
}
