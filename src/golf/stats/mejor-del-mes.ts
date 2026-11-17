/**
 * "Tu mejor del mes" — sobre RondaNormalizada (la misma fuente que /perfil/historial
 * y /perfil/stats), para que el dashboard no se contradiga con esas pantallas.
 *
 * Reemplaza a src/lib/mi-golf/mejor-del-mes.ts, que inventaba par 36/72 por hoyos
 * jugados y comparaba un scramble, un match play o una de 9 contra una de 18.
 *
 * Reglas:
 * - Solo rondas que cuentan (`rondasQueCuentan`: fueraDePromedios == null y con vsPar).
 * - Se compara dentro de un mismo bucket: la mejor de 18 y la mejor de 9 son dos
 *   mejores distintas, cada una rotulada con sus hoyos.
 * - Mes calendario de `played_at` (fecha de la ronda, sin hora) igual al de `fechaHoy`.
 * - Empate de vsPar: gana la más antigua (la que marcó el número primero). Mismo día:
 *   la que viene después en el orden de entrada (la capa de datos entrega la más
 *   reciente primero), así el resultado no depende de quién llama.
 */
import { rondasQueCuentan, type RondaNormalizada } from './rondas-normalizadas'

export interface MejorDelMes {
  /** id de la historical_round. */
  roundId: string
  /** Hoyos de la ronda: la mejor se elige contra rondas de los mismos hoyos. */
  bucket: 18 | 9
  vsPar: number
}

const mes = (fecha: string) => fecha.slice(0, 7)

/** La mejor ronda del mes de `fechaHoy` en cada bucket con rondas que cuentan (18 primero). */
export function mejoresDelMes(rondas: RondaNormalizada[], fechaHoy: string): MejorDelMes[] {
  const mesHoy = mes(fechaHoy)
  const out: MejorDelMes[] = []
  for (const bucket of [18, 9] as const) {
    let mejor: (RondaNormalizada & { vsPar: number }) | null = null
    for (const r of rondasQueCuentan(rondas, bucket)) {
      if (!r.played_at || mes(r.played_at) !== mesHoy) continue
      // `<=` en fecha: con empate de vsPar, la más antigua; mismo día, la posterior en la lista.
      if (!mejor || r.vsPar < mejor.vsPar || (r.vsPar === mejor.vsPar && r.played_at <= mejor.played_at)) mejor = r
    }
    if (mejor) out.push({ roundId: mejor.id, bucket, vsPar: mejor.vsPar })
  }
  return out
}

