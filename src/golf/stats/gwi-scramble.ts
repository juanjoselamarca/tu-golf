/**
 * GWI del scramble — probabilidad de ganar de 2 equipos de scramble en vivo, con un modelo propio (v2, 27-nov-2026).
 *
 * Por qué no sirve el GWI individual (`gwi.ts`): su varianza por hoyo está calibrada para UN jugador según su índice, y
 * mide lo que falta con el avance del que más lleva. En un scramble de 4 el equipo elige el mejor golpe de cuatro
 * (varianza mucho menor), y los equipos salen a horas distintas: el que va atrás en hoyos tiene más ronda por delante.
 *
 * Modelo (cálculo EXACTO sobre scores enteros, sin la aproximación normal de la v1):
 *   gross del hoyo h que falta = entero con media  c + δ_i + o(par_h) + G_i/N  y desvío σ   (normal discretizada)
 *   final_i = diff_i + Σ gross de lo que falta − golpes de HCP que le quedan            (neto; en gross G = 0)
 *   P(A gana) = P(final_A < final_B) + ½ · P(empate)
 * - c = ritmo común por hoyo vs par, sin la mezcla de pares (lo que dan los dos equipos juntos, encogido hacia 0 con
 *   un previo de `HOYOS_DEL_PREVIO` hoyos para que 3 hoyos buenos no lo disparen). El HCP de equipo existe para
 *   igualarlos: por defecto los dos juegan al mismo ritmo.
 * - o(par) = cuánto más fácil o difícil es un par 3/4/5 respecto del par (`AJUSTE_POR_PAR`). Pesa cuando a un equipo le
 *   quedan los par 5 y al otro los par 3: con salidas separadas los dos no tienen la misma ronda por delante.
 * - δ_i = el nivel propio del equipo que el HCP no alcanzó a igualar: desconocido, con desvío `TAU_NIVEL_EQUIPO` por hoyo.
 *   Lo que lleva jugado lo aprende un poco (partial pooling: peso h / (h + σ²/τ²)). Se integra con cuadratura de
 *   Gauss-Hermite. Mueve poco (≤ 2 puntos): suma incertidumbre, pero el que va adelante probablemente también es algo
 *   mejor, y las dos cosas casi se compensan. Lo honesto es contar las dos.
 * - G_i / N y golpes que le quedan = en neto, los golpes de HCP se reparten por índice de dificultad: el que ya jugó
 *   los hoyos donde recibe golpe tiene menos neto por delante. Como el gross y los golpes son enteros, el neto final
 *   también lo es y el empate se calcula exacto.
 * - Empate = medio triunfo: el desempate es del countback, que el modelo no mira.
 *
 * Fuentes y calibración en `docs/claude/gwi-scramble.md`. Validado contra una simulación Monte Carlo del mismo modelo y
 * con casos de golf en `gwi-scramble.test.ts`.
 */

import { HOYOS_MINIMOS_GWI } from './gwi'

/**
 * Desvío por hoyo del score de un equipo de scramble de 4 (25-nov-2026): un profesional del PGA Tour varía ~2,8 golpes
 * por ronda (Data Golf, "Model Talk: variance") → ~0,66 por hoyo; el único scramble real en la base (2 equipos de club,
 * 18 hoyos, HCP 6-8) dio 0,55 por hoyo. Un 4-scramble amateur juega como un profesional: 0,6 queda entre los dos.
 */
export const SIGMA_HOYO_SCRAMBLE = 0.6

/**
 * Desvío del nivel propio de un equipo, por hoyo, que el HCP de equipo no iguala (≈ 1,8 golpes en 18 hoyos). Las
 * asignaciones de scramble (USGA: 25/20/15/10 % de los course handicaps) igualan en promedio, no equipo a equipo.
 * Con 0,1 un equipo aprende la mitad de su ritmo propio recién a los 36 hoyos (σ²/τ²): el HCP manda, como debe.
 */
export const TAU_NIVEL_EQUIPO = 0.1

/** Peso del previo (ritmo 0 vs par) en hoyos, para estimar el ritmo común `c`. */
export const HOYOS_DEL_PREVIO = 18

/**
 * Cuánto mejor (−) o peor (+) se juega un hoyo según su par, relativo al par 4. Estimación (27-nov-2026), no un dato
 * publicado para scramble:
 * - Golfers+ (`historical_rounds` de prod, score vs par por tipo de hoyo): jugadores de ≤ 78 golpes juegan el par 5
 *   0,68 mejor que el par 4; los de 79-88, 0,24 mejor. El par 3 queda igual al par 4 en 79-88.
 * - PGA Tour (stats 142/144, promedios en par 3 y par 5): en el nivel profesional el par 5 es el único bajo par.
 * Un 4-scramble pega el mejor de cuatro drives y llega a los par 5 en dos: −0,37 queda entre las dos bandas propias.
 * Otros pares (6 o raros) cuentan como par 4.
 */
export const AJUSTE_POR_PAR: Readonly<Record<number, number>> = { 3: 0.02, 4: 0, 5: -0.37 }
const ajusteDe = (par: number) => AJUSTE_POR_PAR[par] ?? 0

export interface EquipoGWIScramble {
  /** Score primario vs par de los hoyos jugados (neto o gross según el modo). Menos = mejor. */
  diff: number
  holesPlayed: number
  /** Solo neto: golpes de HCP que reparte la ronda al equipo (suma de todos los hoyos). */
  golpesHcpTotal?: number
  /** Solo neto: de esos, los que caen en hoyos que el equipo todavía no juega. */
  golpesHcpRestantes?: number
  /** Par de cada hoyo jugado. Sin el dato (o largo distinto de `holesPlayed`) no se ajusta por la mezcla de pares. */
  paresJugados?: readonly number[]
  /** Par de cada hoyo que le falta. Sin el dato (o largo distinto de lo que falta) no se ajusta. */
  paresRestantes?: readonly number[]
}

interface Lectura {
  restantes: number
  /** Suma de `AJUSTE_POR_PAR` de lo jugado y de lo que falta (0 sin el dato). */
  ajusteJugado: number
  ajusteRestante: number
  /** Golpes de HCP por hoyo en promedio (G/N) y los que le quedan (enteros). 0 en gross. */
  golpesPorHoyo: number
  golpesQueQuedan: number
}

function leer(e: EquipoGWIScramble, totalHoyos: number): Lectura {
  const restantes = Math.max(0, totalHoyos - e.holesPlayed)
  const pares = e.paresJugados?.length === e.holesPlayed && e.paresRestantes?.length === restantes
  const suma = (ps: readonly number[] | undefined) => (pares && ps ? ps.reduce((s, p) => s + ajusteDe(p), 0) : 0)
  const neto = e.golpesHcpTotal != null && e.golpesHcpRestantes != null && totalHoyos > 0
  return {
    restantes,
    ajusteJugado: suma(e.paresJugados),
    ajusteRestante: suma(e.paresRestantes),
    golpesPorHoyo: neto ? e.golpesHcpTotal! / totalHoyos : 0,
    golpesQueQuedan: neto ? Math.round(e.golpesHcpRestantes!) : 0,
  }
}

/**
 * Ritmo común esperado por hoyo (vs par, en el modo de la ronda, sin la mezcla de pares) para lo que falta. En neto el
 * diff ya descontó los golpes de HCP de lo jugado, así que lo que falta se mide igual.
 */
export function ritmoComun(a: EquipoGWIScramble, b: EquipoGWIScramble, totalHoyos = 18): number {
  const la = leer(a, totalHoyos), lb = leer(b, totalHoyos)
  return (a.diff - la.ajusteJugado + b.diff - lb.ajusteJugado) / (a.holesPlayed + b.holesPlayed + HOYOS_DEL_PREVIO)
}

/** Distribución de enteros: `p[i]` = probabilidad de `desde + i`. */
export interface Dist { desde: number; p: number[] }

/**
 * Normal discretizada sobre los enteros con media `m` y varianza `sigma²`, ajustadas (discretizar corre la media hacia el
 * entero más cercano y agrega varianza): una inclinación exponencial fija la media y la escala fija la varianza, las dos
 * por bisección (monótonas). Es caro, así que se arma una vez por σ para 101 partes fraccionarias de la media (0, 0,01…
 * 1) y la media pedida mezcla las dos vecinas: la mezcla conserva la media exacta y agrega a la varianza menos de 0,0001.
 */
function hoyoExacto(m: number, sigma: number): number[] {
  const ks = Array.from({ length: 12 }, (_, i) => i - 5) // enteros −5…6 alrededor de m ∈ [0, 1]
  const armar = (s: number, t: number) => {
    const w = ks.map(k => Math.exp(-((k - m) ** 2) / (2 * s * s) + t * (k - m)))
    const z = w.reduce((x, y) => x + y, 0)
    return w.map(x => x / z)
  }
  const media = (p: number[]) => p.reduce((acc, x, i) => acc + x * ks[i], 0)
  const conMedia = (s: number) => {
    let lo = -10, hi = 10
    for (let i = 0; i < 50; i++) {
      const t = (lo + hi) / 2
      if (media(armar(s, t)) < m) lo = t; else hi = t
    }
    return armar(s, (lo + hi) / 2)
  }
  let lo = 0.05, hi = 3
  for (let i = 0; i < 40; i++) {
    const s = (lo + hi) / 2
    const p = conMedia(s)
    const mu = media(p)
    if (p.reduce((acc, x, j) => acc + x * (ks[j] - mu) ** 2, 0) < sigma * sigma) lo = s; else hi = s
  }
  return conMedia((lo + hi) / 2)
}

const PASOS_TABLA = 100
const tablas = new Map<number, number[][]>()
function tablaDe(sigma: number): number[][] {
  let t = tablas.get(sigma)
  if (!t) {
    t = Array.from({ length: PASOS_TABLA + 1 }, (_, i) => hoyoExacto(i / PASOS_TABLA, sigma))
    tablas.set(sigma, t)
  }
  return t
}

/** Distribución del score de un hoyo (vs par) con media `m` y desvío `sigma`. */
export function distDeHoyo(m: number, sigma: number): Dist {
  const base = Math.floor(m)
  const x = (m - base) * PASOS_TABLA
  const i = Math.min(PASOS_TABLA - 1, Math.floor(x))
  const w = x - i
  const t = tablaDe(sigma)
  return { desde: base - 5, p: t[i].map((v, j) => v * (1 - w) + t[i + 1][j] * w) }
}

function convolucionar(a: Dist, b: Dist): Dist {
  const p = new Array(a.p.length + b.p.length - 1).fill(0)
  for (let i = 0; i < a.p.length; i++) {
    if (a.p[i] < 1e-15) continue
    for (let j = 0; j < b.p.length; j++) p[i + j] += a.p[i] * b.p[j]
  }
  return { desde: a.desde + b.desde, p }
}

/** Distribución del score final del equipo, dado su ritmo por hoyo (ya con δ) para lo que falta. */
function distFinal(e: EquipoGWIScramble, l: Lectura, ritmo: number, pares: readonly number[] | null, sigma: number): Dist {
  // Gross de lo que falta vs par: la suma de los hoyos. Se reparte la media por hoyo (ritmo + golpes/hoyo + ajuste).
  let total: Dist = { desde: 0, p: [1] }
  for (let h = 0; h < l.restantes; h++) {
    const media = ritmo + l.golpesPorHoyo + (pares ? ajusteDe(pares[h]) : 0)
    total = convolucionar(total, distDeHoyo(media, sigma))
  }
  // final = diff + gross de lo que falta − golpes que quedan. diff es entero (golpes vs par).
  return { desde: total.desde + Math.round(e.diff) - l.golpesQueQuedan, p: total.p }
}

/** Nodos y pesos de Gauss-Hermite (probabilistas, 7 nodos) para integrar δ ~ N(μ, v). */
const GH_X = [-3.750439717725742, -2.366759410734541, -1.154405394739968, 0, 1.154405394739968, 2.366759410734541, 3.750439717725742]
const GH_W = [0.000548268855972, 0.030757123967586, 0.240123178605013, 0.457142857142857, 0.240123178605013, 0.030757123967586, 0.000548268855972]

/** Mezcla de distribuciones del final según el nivel del equipo, ya integrada. */
function distIntegrada(e: EquipoGWIScramble, l: Lectura, c: number, sigma: number, tau: number): Dist {
  const pares = e.paresRestantes?.length === l.restantes && e.paresJugados?.length === e.holesPlayed ? e.paresRestantes : null
  // Posterior del nivel propio δ dado lo jugado: lo que se desvió del ritmo común, encogido. Varianza posterior
  // τ²σ² / (σ² + τ²·h). Con τ = 0 no hay nivel propio.
  const h = e.holesPlayed
  let mu = 0, v = 0
  if (tau > 0) {
    const propio = h > 0 ? (e.diff - l.ajusteJugado) / h - c : 0
    const peso = (tau * tau * h) / (tau * tau * h + sigma * sigma)
    mu = peso * propio
    v = (tau * tau * sigma * sigma) / (sigma * sigma + tau * tau * h)
  }
  if (v === 0 || l.restantes === 0) return distFinal(e, l, c + mu, pares, sigma)
  const partes = GH_X.map(x => distFinal(e, l, c + mu + x * Math.sqrt(v), pares, sigma))
  const desde = Math.min(...partes.map(d => d.desde))
  const hasta = Math.max(...partes.map(d => d.desde + d.p.length))
  const p = new Array(hasta - desde).fill(0)
  partes.forEach((d, k) => d.p.forEach((x, i) => { p[d.desde - desde + i] += GH_W[k] * x }))
  return { desde, p }
}

/** P(A < B) + ½ P(A = B) con A y B independientes dado c. */
function pGanaMenor(a: Dist, b: Dist): number {
  // Acumulada de B por encima de cada valor.
  const finB = b.desde + b.p.length
  const masDe = (k: number) => { // P(B > k)
    if (k < b.desde) return 1
    if (k >= finB - 1) return 0
    let s = 0
    for (let j = k + 1 - b.desde; j < b.p.length; j++) s += b.p[j]
    return s
  }
  const igual = (k: number) => (k >= b.desde && k < finB ? b.p[k - b.desde] : 0)
  let total = 0
  a.p.forEach((x, i) => {
    if (x < 1e-15) return
    const k = a.desde + i
    total += x * (masDe(k) + 0.5 * igual(k))
  })
  return total
}

export interface OpcionesGWIScramble {
  sigma?: number
  tau?: number
}

/**
 * Probabilidad (0-1, sin redondear) de que gane A. Los dos terminados: 1, 0 o 0,5 si empatan (el desempate es del
 * countback, que este modelo no mira).
 */
export function probabilidadDeGanarScramble(
  a: EquipoGWIScramble, b: EquipoGWIScramble, totalHoyos: number, opciones: OpcionesGWIScramble = {},
): number {
  const sigma = opciones.sigma ?? SIGMA_HOYO_SCRAMBLE
  const tau = opciones.tau ?? TAU_NIVEL_EQUIPO
  const la = leer(a, totalHoyos), lb = leer(b, totalHoyos)
  const c = ritmoComun(a, b, totalHoyos)
  const p = pGanaMenor(distIntegrada(a, la, c, sigma, tau), distIntegrada(b, lb, c, sigma, tau))
  return Math.min(1, Math.max(0, p))
}

/**
 * Los dos porcentajes enteros que se muestran (suman 100), entre 1 y 99: todavía no está decidido. `null` = no se
 * muestra: nadie llegó a `HOYOS_MINIMOS_GWI` hoyos, o los dos terminaron (ya no es una probabilidad: el ganador
 * lo dice la tabla, con countback si empatan — un «50 / 50» o «100 / 0» la contradiría; revisión Fable #894).
 */
export function porcentajesDeGanarScramble(a: EquipoGWIScramble, b: EquipoGWIScramble, totalHoyos: number): [number, number] | null {
  if (Math.max(a.holesPlayed, b.holesPlayed) < HOYOS_MINIMOS_GWI) return null
  if (a.holesPlayed >= totalHoyos && b.holesPlayed >= totalHoyos) return null
  const p = probabilidadDeGanarScramble(a, b, totalHoyos)
  const pa = Math.min(99, Math.max(1, Math.round(p * 100)))
  return [pa, 100 - pa]
}
