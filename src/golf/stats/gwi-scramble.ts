/**
 * GWI del scramble — probabilidad de ganar de 2 equipos de scramble en vivo, con un modelo propio.
 *
 * Por qué no sirve el GWI individual (`gwi.ts`): su varianza por hoyo está calibrada para UN jugador según su índice, y
 * mide lo que falta con el avance del que más lleva. En un scramble de 4 el equipo elige el mejor golpe de cuatro
 * (varianza mucho menor), y los equipos salen a horas distintas: el que va atrás en hoyos tiene más ronda por delante.
 *
 * Modelo (aproximación normal del score final, el estándar de los modelos en vivo):
 *   final_i = diff_i + c · r_i − a_i      (diff = vs par de lo jugado en el modo de la ronda; r = hoyos que le faltan)
 *   P(A gana) = Φ((final_B − final_A) / (σ · √(r_A + r_B)))
 * - c = ritmo esperado por hoyo (vs par, neto o gross). Es el MISMO para los dos equipos: el HCP de equipo existe para
 *   igualarlos, y el rendimiento de lo que va de la ronda casi no predice lo que viene (Data Golf, "Model Talk"). Se
 *   estima con lo que llevan los dos juntos, encogido hacia 0 con un previo de `HOYOS_DEL_PREVIO` hoyos, para que 3
 *   hoyos buenos no lo disparen. Solo pesa cuando los equipos llevan distinta cantidad de hoyos.
 * - a = en neto, los golpes de HCP que le quedan por recibir por sobre su parte pareja (HCP · r / N): el motor los
 *   reparte por el índice de dificultad de cada hoyo, así que el que ya jugó los hoyos donde recibe golpe tiene
 *   menos neto por delante. Con HCP 8 y 9 hoyos jugados, la diferencia llega a ~1 golpe (≈15 puntos de %).
 * - σ = desvío del score de un equipo de scramble en un hoyo (`SIGMA_HOYO_SCRAMBLE`).
 * - Los empates (scores enteros) quedan repartidos por la mitad: la corrección de continuidad es simétrica.
 *
 * Validado contra una simulación hoyo a hoyo con scores enteros (`gwi-scramble.test.ts`).
 */

/**
 * Desvío por hoyo del score de un equipo de scramble de 4. Calibración (25-nov-2026):
 * - un profesional del PGA Tour varía ~2,8 golpes por ronda (Data Golf, "Model Talk: variance") → ~0,66 por hoyo;
 * - el único scramble real en la base (2 equipos de club, 18 hoyos, HCP 6-8) dio 0,55 por hoyo.
 * Un 4-scramble amateur juega como un profesional (8 a 16 bajo par gross en un buen día): 0,6 queda entre los dos.
 * El resultado es poco sensible a este número: con 1 golpe de ventaja y 9+9 hoyos por jugar da 64-66 % entre 0,55 y 0,66.
 */
export const SIGMA_HOYO_SCRAMBLE = 0.6

/** Peso del previo (ritmo 0 vs par) en hoyos, para estimar el ritmo común `c`. */
export const HOYOS_DEL_PREVIO = 18

export interface EquipoGWIScramble {
  /** Score primario vs par de los hoyos jugados (neto o gross según el modo). Menos = mejor. */
  diff: number
  holesPlayed: number
  /** Solo neto: golpes de HCP que reparte la ronda al equipo (suma de todos los hoyos). */
  golpesHcpTotal?: number
  /** Solo neto: de esos, los que caen en hoyos que el equipo todavía no juega. */
  golpesHcpRestantes?: number
}

/** Golpes de HCP por recibir por sobre la parte pareja de lo que falta (0 en gross). */
function golpesDeMas(e: EquipoGWIScramble, totalHoyos: number, restantes: number): number {
  if (e.golpesHcpTotal == null || e.golpesHcpRestantes == null || totalHoyos <= 0) return 0
  return e.golpesHcpRestantes - e.golpesHcpTotal * restantes / totalHoyos
}

function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
const normalCDF = (x: number) => 0.5 * (1 + erf(x / Math.SQRT2))

/** Ritmo común esperado por hoyo (vs par) para lo que falta. */
export function ritmoComun(a: EquipoGWIScramble, b: EquipoGWIScramble): number {
  return (a.diff + b.diff) / (a.holesPlayed + b.holesPlayed + HOYOS_DEL_PREVIO)
}

/**
 * Probabilidad (0-1, sin redondear) de que gane A. Los dos terminados: 1, 0 o 0,5 si empatan (el desempate es del
 * countback, que este modelo no mira).
 */
export function probabilidadDeGanarScramble(a: EquipoGWIScramble, b: EquipoGWIScramble, totalHoyos: number, sigma = SIGMA_HOYO_SCRAMBLE): number {
  const rA = Math.max(0, totalHoyos - a.holesPlayed)
  const rB = Math.max(0, totalHoyos - b.holesPlayed)
  const c = ritmoComun(a, b)
  const finalA = a.diff + c * rA - golpesDeMas(a, totalHoyos, rA)
  const finalB = b.diff + c * rB - golpesDeMas(b, totalHoyos, rB)
  const ventajaDeA = finalB - finalA
  const desvio = sigma * Math.sqrt(rA + rB)
  if (desvio === 0) return ventajaDeA > 0 ? 1 : ventajaDeA < 0 ? 0 : 0.5
  return normalCDF(ventajaDeA / desvio)
}

/** Desde cuántos hoyos del que más lleva se muestra (mismo umbral que el GWI individual, `HOYOS_MINIMOS_GWI`). */
export const HOYOS_MINIMOS_GWI_SCRAMBLE = 3

/**
 * Los dos porcentajes enteros que se muestran (suman 100). Mientras quede ronda por jugar ninguno llega a 0 ni a 100
 * (1-99): todavía no está decidido. `null` = no se muestra (nadie llegó a 3 hoyos).
 */
export function porcentajesDeGanarScramble(a: EquipoGWIScramble, b: EquipoGWIScramble, totalHoyos: number): [number, number] | null {
  if (Math.max(a.holesPlayed, b.holesPlayed) < HOYOS_MINIMOS_GWI_SCRAMBLE) return null
  const p = probabilidadDeGanarScramble(a, b, totalHoyos)
  const terminado = a.holesPlayed >= totalHoyos && b.holesPlayed >= totalHoyos
  const pa = terminado ? Math.round(p * 100) : Math.min(99, Math.max(1, Math.round(p * 100)))
  return [pa, 100 - pa]
}
