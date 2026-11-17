/**
 * Mental Index — cuántos de tus bogeys cortas en el hoyo siguiente (0-100).
 *
 * Una sola definición de espiral para todo el coach: el chip de la Curva mental,
 * el Costo psicológico y el índice salen de las mismas funciones y de la misma
 * ventana de rondas (`resumenMentalDelCoach`). Determinístico, sin LLM.
 *
 * Decisiones de Juanjo (17-nov-2026): tasa cruda, sin ajuste por nivel; el copy
 * describe con datos del propio jugador, sin juicio.
 *
 * Definiciones (un hoyo "cuenta" si tiene score, par real y no es estimado):
 * - Oportunidad: hoyo que cuenta, bogey o peor, cuyo hoyo siguiente (por posición
 *   en la tarjeta) también cuenta.
 * - Corte: el siguiente de una oportunidad es par o mejor.
 * - Espiral: racha de ≥2 hoyos consecutivos bogey o peor. Un hoyo que no cuenta
 *   corta la racha.
 * - Identidad: oportunidades − cortes = Σ (hoyos − 1) sobre las espirales.
 */

import {
  bucketPrincipal,
  rondasQueCuentan,
  type RondaNormalizada,
} from '@/golf/stats/rondas-normalizadas'

/** Lo que el motor mental lee de una ronda normalizada. */
export type RondaMental = Pick<
  RondaNormalizada,
  'id' | 'tarjeta' | 'pares' | 'hoyosEstimados' | 'total_gross' | 'played_at' | 'course_name' | 'vsPar'
>

/** Racha de ≥2 hoyos consecutivos bogey o peor. Posiciones 0-based de la tarjeta. */
export interface Espiral {
  desde: number
  hasta: number
  hoyos: number
  /** Golpes sobre el bogey en los hoyos de la espiral después del primero. */
  golpesEvitables: number
}

export type MentalState = 'calm' | 'tense' | 'tilt'

/** Detector `post_bogey_spiral` (patterns.ts): tasa de bogeys seguidos de otro sobre la que se activa. */
export const TASA_ESPIRAL_UMBRAL = 0.4
/** Mínimo de bogeys (oportunidades) para hablar de espiral: detector y Mental Index. */
export const MIN_BOGEYS_ESPIRAL = 10
/** Rondas de la ventana del coach (índice, costo y curva). */
export const VENTANA_MENTAL = 5

/** Bandas del Mental Index: high ≥60, mid 50-59, low <50. */
export const BANDA_MENTAL_ALTA = 60
export const BANDA_MENTAL_MEDIA = 50

/** Ronda que entra a los números (rondasQueCuentan): vsPar siempre conocido. */
export type RondaDeVentana = RondaNormalizada & { vsPar: number }

export type BandaMental = 'low' | 'mid' | 'high'
export type BucketMental = 18 | 9

export interface VentanaMental {
  bucket: BucketMental | null
  /** Más reciente primero. Solo rondas del bucket, con pares reales y que cuentan. */
  rondas: RondaDeVentana[]
}

export interface MentalIndexResult {
  score: number | null
  band: BandaMental | null
  status: 'insufficient_data' | 'provisional' | 'established'
  oportunidades: number
  cortes: number
  windowSize: number
  bucket: BucketMental | null
}

export interface CostoPsicologicoResult {
  /** Golpes evitables totales sobre la ventana. */
  evitables: number
  /** Promedio de total_gross sobre la ventana. */
  promedioReal: number
  /** promedioReal − evitables / windowSize. */
  promedioContenido: number
  windowSize: number
  bucket: BucketMental | null
  /** La ronda más reciente de la ventana, solo si alguna espiral suya costó golpes. */
  lastRound: {
    id: string
    realScore: number
    ghostScore: number
    strokes_saved: number
    /** Solo las espirales que costaron golpes (las de puros bogeys ya están contenidas). */
    espirales: Espiral[]
  } | null
}

export interface CurvaMental {
  ronda: RondaDeVentana
  estados: (MentalState | null)[]
  espirales: Espiral[]
}

export interface ResumenMental {
  ventana: VentanaMental
  indice: MentalIndexResult
  costo: CostoPsicologicoResult
  curva: CurvaMental | null
}

// ─── Por ronda ────────────────────────────────────────────────────────────────

/** Golpes sobre par del hoyo en la posición i, o null si el hoyo no cuenta. */
function sobreParQueCuenta(r: RondaMental, i: number, estimados: ReadonlySet<number>): number | null {
  const s = r.tarjeta[i]
  const par = r.pares[i]
  if (typeof s !== 'number' || typeof par !== 'number' || estimados.has(i)) return null
  return s - par
}

function sobrePares(r: RondaMental): (number | null)[] {
  const estimados = new Set(r.hoyosEstimados)
  return Array.from({ length: r.tarjeta.length }, (_, i) => sobreParQueCuenta(r, i, estimados))
}

const esBogeyOPeor = (sobre: number | null): sobre is number => sobre != null && sobre >= 1

export function espiralesDeRonda(r: RondaMental): Espiral[] {
  const sobre = sobrePares(r)
  const espirales: Espiral[] = []
  let desde = -1
  const cerrar = (hasta: number) => {
    if (desde >= 0 && hasta - desde >= 1) {
      let golpesEvitables = 0
      for (let i = desde + 1; i <= hasta; i++) golpesEvitables += Math.max(0, (sobre[i] as number) - 1)
      espirales.push({ desde, hasta, hoyos: hasta - desde + 1, golpesEvitables })
    }
    desde = -1
  }
  for (let i = 0; i < sobre.length; i++) {
    if (esBogeyOPeor(sobre[i])) {
      if (desde < 0) desde = i
    } else {
      cerrar(i - 1)
    }
  }
  cerrar(sobre.length - 1)
  return espirales
}

export function recuperacionDeRonda(r: RondaMental): { oportunidades: number; cortes: number } {
  const sobre = sobrePares(r)
  let oportunidades = 0
  let cortes = 0
  for (let i = 0; i < sobre.length - 1; i++) {
    const siguiente = sobre[i + 1]
    if (!esBogeyOPeor(sobre[i]) || siguiente == null) continue
    oportunidades++
    if (siguiente <= 0) cortes++
  }
  return { oportunidades, cortes }
}

/**
 * Estado de cada hoyo para la Curva mental: tilt = hoyo de espiral después del
 * primero; tense = bogey o peor que no sigue a otro; calm = par o mejor; null si
 * el hoyo no cuenta.
 */
export function estadosDeRonda(r: RondaMental): (MentalState | null)[] {
  const sobre = sobrePares(r)
  return sobre.map((s, i) => {
    if (s == null) return null
    if (s <= 0) return 'calm'
    return i > 0 && esBogeyOPeor(sobre[i - 1]) ? 'tilt' : 'tense'
  })
}

/** "H11–H13": hoyos por posición de la tarjeta. */
export function etiquetaEspiral(e: Espiral): string {
  return `H${e.desde + 1}–H${e.hasta + 1}`
}

// ─── Ventana ─────────────────────────────────────────────────────────────────

/**
 * La ventana única del coach. `rondas` debe venir más reciente primero (como
 * `fetchRondasNormalizadas`). Elegibles: suman hoyo a hoyo, con par real en cada
 * hoyo jugado y tarjeta. Bucket = el que más rondas tiene (nunca mezcla 9 y 18).
 */
export function ventanaMental(rondas: RondaNormalizada[]): VentanaMental {
  const elegibles = rondas.filter(r => r.cuentaHoyoAHoyo && r.parPerHole != null && r.tarjeta.length > 0)
  const bucket = bucketPrincipal(elegibles)
  if (bucket == null) return { bucket: null, rondas: [] }
  return { bucket, rondas: rondasQueCuentan(elegibles, bucket).slice(0, VENTANA_MENTAL) }
}

/** "últimas 5 rondas de 18 hoyos" / "última ronda de 9 hoyos". */
export function textoVentanaMental(windowSize: number, bucket: BucketMental | null): string {
  const base = windowSize === 1 ? 'última ronda' : `últimas ${windowSize} rondas`
  return bucket == null ? base : `${base} de ${bucket} hoyos`
}

export function bandaMental(score: number): BandaMental {
  return score >= BANDA_MENTAL_ALTA ? 'high' : score >= BANDA_MENTAL_MEDIA ? 'mid' : 'low'
}

export function calcularMentalIndex(v: VentanaMental): MentalIndexResult {
  let oportunidades = 0
  let cortes = 0
  for (const r of v.rondas) {
    const rr = recuperacionDeRonda(r)
    oportunidades += rr.oportunidades
    cortes += rr.cortes
  }
  const windowSize = v.rondas.length
  const base = { oportunidades, cortes, windowSize, bucket: v.bucket }
  if (oportunidades < MIN_BOGEYS_ESPIRAL) {
    return { ...base, score: null, band: null, status: 'insufficient_data' }
  }
  const score = Math.round((100 * cortes) / oportunidades)
  return {
    ...base,
    score,
    band: bandaMental(score),
    status: windowSize < VENTANA_MENTAL ? 'provisional' : 'established',
  }
}

/**
 * Costo psicológico sobre la misma ventana del índice. Invariante:
 *   evitables === windowSize × (promedioReal − promedioContenido)
 */
export function calcularCostoPsicologico(v: VentanaMental): CostoPsicologicoResult {
  const windowSize = v.rondas.length
  if (windowSize === 0) {
    return { evitables: 0, promedioReal: 0, promedioContenido: 0, windowSize: 0, bucket: v.bucket, lastRound: null }
  }
  const espiralesPorRonda = v.rondas.map(espiralesDeRonda)
  const costoDe = (es: Espiral[]) => es.reduce((a, e) => a + e.golpesEvitables, 0)
  const evitables = espiralesPorRonda.reduce((a, es) => a + costoDe(es), 0)
  const promedioReal = v.rondas.reduce((a, r) => a + r.total_gross, 0) / windowSize
  const promedioContenido = promedioReal - evitables / windowSize

  const last = v.rondas[0]
  const conCosto = espiralesPorRonda[0].filter(e => e.golpesEvitables > 0)
  const strokesSaved = costoDe(conCosto)
  const lastRound = strokesSaved > 0
    ? { id: last.id, realScore: last.total_gross, ghostScore: last.total_gross - strokesSaved, strokes_saved: strokesSaved, espirales: conCosto }
    : null

  return { evitables, promedioReal, promedioContenido, windowSize, bucket: v.bucket, lastRound }
}

/** Índice, costo y curva de la home del coach, todos sobre la misma ventana. */
export function resumenMentalDelCoach(rondas: RondaNormalizada[]): ResumenMental {
  const ventana = ventanaMental(rondas)
  const ultima = ventana.rondas[0]
  return {
    ventana,
    indice: calcularMentalIndex(ventana),
    costo: calcularCostoPsicologico(ventana),
    curva: ultima ? { ronda: ultima, estados: estadosDeRonda(ultima), espirales: espiralesDeRonda(ultima) } : null,
  }
}

// ─── Copy (descriptivo, con datos del jugador; sin juicio, sin voseo) ─────────

export const TITULO_BANDA_MENTAL: Record<BandaMental, string> = {
  high: 'Cortas la mayoría de tus malos hoyos',
  mid: 'La mitad de tus bogeys traen otro detrás',
  low: 'Más de la mitad de tus bogeys traen otro detrás',
}

/** "Cortaste 6 de tus 14 bogeys en el hoyo siguiente · últimas 5 rondas de 18 hoyos". */
export function fraseMentalIndex(i: MentalIndexResult): string {
  if (i.status === 'insufficient_data') {
    if (i.windowSize === 0) return 'Todavía no hay rondas con tarjeta hoyo a hoyo para medir cuántos bogeys cortas'
    return `Todavía no hay ${MIN_BOGEYS_ESPIRAL} bogeys en tus ${textoVentanaMental(i.windowSize, i.bucket)} para medir cuántos cortas`
  }
  return `Cortaste ${i.cortes} de tus ${i.oportunidades} bogeys en el hoyo siguiente · ${textoVentanaMental(i.windowSize, i.bucket)}`
}
