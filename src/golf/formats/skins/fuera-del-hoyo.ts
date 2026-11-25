/**
 * La X del skins («Fuera del hoyo») fuera del motor: cómo se lee de la base, cómo convive con los golpes en el teléfono
 * y cómo entra al motor. Spec: docs/specs/formato-skins.md, «Scores de un hoyo» y «Datos».
 *
 * La X NUNCA va en `scores` (más de 20 lectores suman golpes sin filtrar): en la base vive en
 * `ronda_libre_jugadores.fuera_del_hoyo` (`{ "7": true }`) y en el scorer en un mapa aparte de los golpes. Solo viaja
 * junto a los golpes en el delta de `upsert_ronda_libre_scores` (valor `"X"`), en la cola de pendientes del teléfono y
 * en la entrada del motor (`ScoreSkins`).
 */
import { FUERA_DEL_HOYO, type ScoreSkins } from './motor'

/** Hoyos de una tarjeta marcados con X. */
export type HoyosFuera = Readonly<Record<number, true>>
/** jugadorId → hoyos con X. */
export type FueraPorJugador = Readonly<Record<string, HoyosFuera>>

const SIN_HOYOS: HoyosFuera = Object.freeze({})

export function esFueraDelHoyo(v: unknown): v is typeof FUERA_DEL_HOYO {
  return v === FUERA_DEL_HOYO
}

export function estaFueraDelHoyo(fuera: HoyosFuera | undefined, hoyo: number): boolean {
  return fuera?.[hoyo] === true
}

/** Hoyos de la ronda con X en la tarjeta (los de fuera de la ronda no cuentan). */
export function hoyosConX(fuera: HoyosFuera | undefined, ordenHoyos: readonly number[]): number[] {
  return ordenHoyos.filter(h => estaFueraDelHoyo(fuera, h))
}

/**
 * `fuera_del_hoyo` de la base → hoyos con X, solo los de la ronda (la base valida 1..27 fijo: en una de 18 entra un
 * `{"25": true}` y en una de 9 que sale del 10 un `{"3": true}`). Cualquier valor que no sea `true` no es X.
 */
export function hoyosFueraDesdeLaBase(valor: unknown, ordenHoyos: readonly number[]): HoyosFuera {
  if (valor == null || typeof valor !== 'object' || Array.isArray(valor)) return SIN_HOYOS
  const out: Record<number, true> = {}
  for (const [k, v] of Object.entries(valor as Record<string, unknown>)) {
    const h = Number(k)
    if (v === true && ordenHoyos.includes(h)) out[h] = true
  }
  return out
}

/** Una capa de la tarjeta: hoyo → golpes o X (la cola de pendientes, los rechazados, un respaldo). */
export type CapaDeTarjeta = Readonly<Record<string | number, ScoreSkins | null | undefined>>

/** Golpes y X de una tarjeta como una sola capa (para combinarla con otras). */
export function capaDeTarjeta(golpes: Readonly<Record<number, number>> | undefined, fuera: HoyosFuera | undefined): Record<number, ScoreSkins> {
  const out: Record<number, ScoreSkins> = { ...(golpes ?? {}) }
  for (const k of Object.keys(fuera ?? {})) out[Number(k)] = FUERA_DEL_HOYO
  return out
}

/**
 * Combina capas de una tarjeta en orden (la última gana por hoyo) y las separa en golpes y X: en un mismo hoyo nunca
 * quedan las dos cosas. Los números pasan tal cual, como el `{ ...a, ...b }` de siempre (un `-1` de conceder en match
 * play también): fuera del skins el resultado es idéntico. `null`/`undefined` no pisan la capa anterior.
 */
export function combinarCapasDeTarjeta(capas: readonly (CapaDeTarjeta | undefined)[]): { golpes: Record<number, number>; fuera: Record<number, true> } {
  const valores = new Map<number, ScoreSkins>()
  for (const capa of capas) {
    for (const [k, v] of Object.entries(capa ?? {})) {
      const h = Number(k)
      if (!Number.isInteger(h)) continue
      if (esFueraDelHoyo(v) || (typeof v === 'number' && Number.isFinite(v))) valores.set(h, v)
    }
  }
  const golpes: Record<number, number> = {}
  const fuera: Record<number, true> = {}
  for (const [h, v] of valores) {
    if (esFueraDelHoyo(v)) fuera[h] = true
    else golpes[h] = v
  }
  return { golpes, fuera }
}

/** Solo los golpes de una capa (la tarjeta de un equipo nunca lleva X: la RPC de equipos no la acepta). */
export function soloGolpes(capa: CapaDeTarjeta | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(capa ?? {})) if (typeof v === 'number') out[k] = v
  return out
}

/**
 * Adaptador base → motor de una tarjeta: golpes y X de los hoyos de la ronda. Un `-1` (conceder, de match play: la
 * base lo acepta en cualquier formato) o cualquier valor que no sea golpe es «sin anotar», nunca golpes. Golpes y X en
 * el mismo hoyo no pueden existir (CHECK en la base): no se decide precedencia.
 */
export function tarjetaDelSkins(
  scores: Readonly<Record<string | number, unknown>> | null | undefined,
  fuera: HoyosFuera | undefined,
  ordenHoyos: readonly number[],
): Record<number, ScoreSkins> {
  const out: Record<number, ScoreSkins> = {}
  for (const h of ordenHoyos) {
    const v = scores?.[h] ?? scores?.[String(h)]
    if (typeof v === 'number' && Number.isInteger(v) && v >= 1) out[h] = v
    else if (estaFueraDelHoyo(fuera, h)) out[h] = FUERA_DEL_HOYO
  }
  return out
}
