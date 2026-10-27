// src/lib/draft/team-config-legacy.ts
//
// Conversión de la forma vieja de `team_config` a la nueva, al LEER. Sin
// migración de JSONB: los borradores (`tournament_drafts.config`) y torneos
// (`tournaments.team_config`) guardados con la forma vieja se normalizan cada
// vez que se leen (schema.ts vía `z.preprocess`, `upgradeConfig`, wizard).
//
// Forma vieja:  { handicap_pct: 'usga_35_15' | 'usga_25_15' | 'simple_avg' | 'custom',
//                 handicap_pct_custom?: { lower_pct, higher_pct } }
// Forma nueva:  { handicap: TeamHandicapConfig }   (ver types.ts)
//
// Reglas (decisión de producto 23-oct-2026: se eliminan "USGA 25/15" y
// "Promedio simple"; el único modo de fábrica es el oficial):
//   - usga_35_15 | usga_25_15 | simple_avg     → { modo: 'oficial' }
//   - custom con lower/higher y size 2          → personalizado [lower, higher]
//   - custom en size 3-4, sin % válidos, o sin size → { modo: 'oficial' } (los dos %
//     viejos no dicen nada de la 3.ª y 4.ª posición: no se inventan)
//   - si ya viene `handicap`, gana y las llaves viejas se descartan.
// Cualquier otra cosa pasa intacta: la valida el schema.

import { esPorcentajeDeEquipo } from '@/golf/formats/team-handicap'
import type { TeamConfig, TeamHandicapConfig } from './types'

const LLAVES_LEGADAS = ['handicap_pct', 'handicap_pct_custom'] as const

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function handicapDesdeLegado(raw: Record<string, unknown>): TeamHandicapConfig | undefined {
  const pct = raw.handicap_pct
  if (pct === undefined || pct === null) return undefined
  if (pct !== 'custom') return { modo: 'oficial' }
  const custom = raw.handicap_pct_custom
  if (raw.size === 2 && esObjeto(custom) && esPorcentajeDeEquipo(custom.lower_pct) && esPorcentajeDeEquipo(custom.higher_pct)) {
    return { modo: 'personalizado', porcentajes: [custom.lower_pct, custom.higher_pct] }
  }
  return { modo: 'oficial' }
}

/**
 * Devuelve `team_config` en la forma nueva. Si `raw` no es un objeto (o no trae
 * nada viejo), lo devuelve tal cual. Sirve para configs completas y parciales:
 * no agrega campos que no venían (salvo `handicap`, si venía `handicap_pct`).
 */
export function normalizarTeamConfig(raw: unknown): unknown {
  if (!esObjeto(raw)) return raw
  const tieneLegado = LLAVES_LEGADAS.some((k) => k in raw)
  if (!tieneLegado) return raw

  const resultado: Record<string, unknown> = { ...raw }
  for (const k of LLAVES_LEGADAS) delete resultado[k]
  if (resultado.handicap === undefined) {
    const handicap = handicapDesdeLegado(raw)
    if (handicap) resultado.handicap = handicap
  }
  return resultado
}

/** Versión tipada para quien lee un `team_config` ya guardado (JSONB). */
export function leerTeamConfig(raw: unknown): Partial<TeamConfig> | null {
  const n = normalizarTeamConfig(raw)
  return esObjeto(n) ? (n as Partial<TeamConfig>) : null
}

/**
 * `team_config.handicap` de un torneo ya guardado, en la forma nueva. null si no
 * viene (= oficial) o si no es un objeto: así `handicapDeEquipo` nunca recibe un
 * valor que no pueda inspeccionar (un objeto con otra forma lo rechaza él).
 */
export function leerHandicapDeEquipo(raw: unknown): TeamHandicapConfig | null {
  const handicap: unknown = leerTeamConfig(raw)?.handicap
  return esObjeto(handicap) ? (handicap as TeamHandicapConfig) : null
}
