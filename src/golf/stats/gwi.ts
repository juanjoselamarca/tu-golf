/**
 * GWI™ — Golf Win Index.
 * Probabilidad de ganar basada en situación actual, historial, cancha y patrones.
 */

import type { ModoJuego } from '../core/rules'

// ─── Matemáticas base ───
function normalCDF(x: number): number {
  return 0.5 * (1 + erf(x / Math.sqrt(2)))
}
function erf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x))
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t)
    + 1.421413741) * t - 0.284496736) * t + 0.254829592)
    * t * Math.exp(-x * x)
  return x >= 0 ? y : -y
}
function poissonPMF(lambda: number, k: number): number {
  if (k < 0 || lambda <= 0) return 0
  let logP = -lambda + k * Math.log(lambda)
  for (let i = 1; i <= k; i++) logP -= Math.log(i)
  return Math.exp(logP)
}

/**
 * Varianza realista por hoyo según par y handicap.
 * Basada en datos estadísticos de golf amateur:
 * - Par 3: σ ~0.80-1.20 strokes
 * - Par 4: σ ~0.95-1.40 strokes
 * - Par 5: σ ~1.05-1.50 strokes
 * Mayor HCP = ligeramente más varianza
 */
export function varianzaPorHoyo(handicapIndex: number, parHoyo: number = 4): number {
  const hcp = Math.max(0, Math.min(handicapIndex ?? 18, 54))
  const basePorPar: Record<number, number> = { 3: 0.80, 4: 0.95, 5: 1.05 }
  const base = basePorPar[parHoyo] ?? 0.95
  return base + 0.02 * hcp
}
export function sigmaTotal(handicapIndex: number, hoyosRestantes: number): number {
  return Math.sqrt(Math.max(0, hoyosRestantes)) * varianzaPorHoyo(handicapIndex, 4)
}

export interface ProbHoyo {
  eagle: number; birdie: number; par: number
  bogey: number; doble: number; masDoble: number
}
export function probResultadoHoyo(handicapIndex: number, parHoyo: number): ProbHoyo {
  const lambda   = Math.max(parHoyo + (handicapIndex / 18), 1)
  const eagle    = poissonPMF(lambda, Math.max(parHoyo - 2, 1))
  const birdie   = poissonPMF(lambda, parHoyo - 1)
  const par      = poissonPMF(lambda, parHoyo)
  const bogey    = poissonPMF(lambda, parHoyo + 1)
  const doble    = poissonPMF(lambda, parHoyo + 2)
  const total    = eagle + birdie + par + bogey + doble
  const masDoble = Math.max(0, 1 - total)
  const tot2     = total + masDoble
  return {
    eagle:    Math.round((eagle    / tot2) * 100),
    birdie:   Math.round((birdie   / tot2) * 100),
    par:      Math.round((par      / tot2) * 100),
    bogey:    Math.round((bogey    / tot2) * 100),
    doble:    Math.round((doble    / tot2) * 100),
    masDoble: Math.max(0, 100 - Math.round(((eagle + birdie + par + bogey + doble) / tot2) * 100)),
  }
}

export interface JugadorGWIInput {
  id:                    string
  nombre:                string
  handicapIndex:         number
  currentScore:          number
  hoyosCompletados:      number
  modoJuego:             ModoJuego
  historicalAvg:         number | null
  historicalRoundsCount: number
  courseAvg:             number | null
  courseRoundsCount:     number
  patterns: {
    back9Collapse?:   { confidence: number; avgDiff: number }
    postBogeySpiral?: { confidence: number }
    courseSpecific?:  { confidence: number; avgDiff: number }
  } | null
}

export interface GWIResult {
  id:              string
  nombre:          string
  winProbability:  number
  tendencia:       'up' | 'down' | 'stable'
  volatilidad:     'baja' | 'media' | 'alta'
  narrativa:       string
  breakdown: {
    situacion:    { peso: number; valor: number }
    historico:    { peso: number; valor: number; confianza: number }
    cancha:       { peso: number; valor: number; confianza: number }
    patrones:     { peso: number; valor: number }
    handicapInfo: { handicap: number; sigma: number; label: string }
  }
}

export function calcularGWI(
  jugadores: JugadorGWIInput[],
  totalHoyos: number
): GWIResult[] {
  if (jugadores.length === 0) return []
  if (jugadores.length === 1) return [{
    id: jugadores[0].id, nombre: jugadores[0].nombre,
    winProbability: 100, tendencia: 'stable', volatilidad: 'baja', narrativa: 'Jugando solo',
    breakdown: {
      situacion: { peso: 100, valor: 0 }, historico: { peso: 0, valor: 0, confianza: 0 },
      cancha: { peso: 0, valor: 0, confianza: 0 }, patrones: { peso: 0, valor: 0 },
      handicapInfo: { handicap: jugadores[0].handicapIndex, sigma: 0, label: 'N/A' },
    }
  }]

  const progreso       = Math.max(...jugadores.map(j => j.hoyosCompletados), 0)
  const hoyosRestantes = Math.max(totalHoyos - progreso, 0)
  const progresoRatio  = progreso / totalHoyos
  const esStableford   = jugadores[0].modoJuego === 'stableford'
  const esNeto         = jugadores[0].modoJuego === 'neto'
  const W1 = 0.30 + progresoRatio * 0.50
  const pesoResto = 1 - W1

  const ajustados = jugadores.map(j => {
    const F1 = esStableford ? -j.currentScore : j.currentScore
    const F2conf = Math.min((j.historicalRoundsCount || 0) / 20, 1)
    const F2     = j.historicalAvg ?? 0
    const W2     = pesoResto * 0.40 * F2conf
    const F3conf = Math.min((j.courseRoundsCount || 0) / 5, 1)
    const F3     = j.courseAvg ?? j.historicalAvg ?? 0
    const W3     = pesoResto * 0.30 * F3conf
    let F4 = 0
    if (j.patterns?.back9Collapse && hoyosRestantes <= 9)
      F4 += j.patterns.back9Collapse.confidence * j.patterns.back9Collapse.avgDiff * (hoyosRestantes / 9)
    if (j.patterns?.postBogeySpiral && j.currentScore > 0)
      F4 += j.patterns.postBogeySpiral.confidence * 0.8
    if (j.patterns?.courseSpecific)
      F4 += j.patterns.courseSpecific.confidence * j.patterns.courseSpecific.avgDiff * 0.5
    const W4 = pesoResto * 0.20
    const W1ef          = W1 + (pesoResto * 0.40 * (1 - F2conf)) + (pesoResto * 0.30 * (1 - F3conf))
    const scoreAjustado = W1ef * F1 + W2 * F2 + W3 * F3 + W4 * F4
    // In neto mode, handicap already leveled the field — use scratch variance for all
    const sigmaHcp      = esNeto ? 0 : j.handicapIndex
    const sigma         = sigmaTotal(sigmaHcp, hoyosRestantes)
    const volatilidad   = j.handicapIndex <= 6 ? 'baja' : j.handicapIndex <= 16 ? 'media' : 'alta'
    const sigmaLabel    = j.handicapIndex <= 6 ? 'Juego muy consistente' : j.handicapIndex <= 16 ? 'Varianza moderada' : 'Alto potencial de cambio'
    return {
      ...j, scoreAjustado, sigma, volatilidad,
      breakdown: {
        situacion: { peso: Math.round(W1ef * 100), valor: F1 },
        historico: { peso: Math.round(W2 * 100), valor: F2, confianza: F2conf },
        cancha:    { peso: Math.round(W3 * 100), valor: F3, confianza: F3conf },
        patrones:  { peso: Math.round(W4 * 100), valor: F4 },
        handicapInfo: { handicap: j.handicapIndex, sigma: Math.round(sigma * 10) / 10, label: sigmaLabel },
      }
    }
  })

  const rawProbs = ajustados.map((j1, i) => {
    return ajustados
      .filter((_, j) => j !== i)
      .map(j2 => {
        const diff       = j2.scoreAjustado - j1.scoreAjustado
        const sigmaCombo = Math.sqrt(j1.sigma ** 2 + j2.sigma ** 2)
        return sigmaCombo > 0 ? normalCDF(diff / sigmaCombo) : (diff > 0 ? 1 : 0.5)
      })
      .reduce((a, b) => a * b, 1)
  })

  const totalRaw = rawProbs.reduce((s, p) => s + p, 0) || 1
  const rawPercents = rawProbs.map(p => (p / totalRaw) * 100)
  const floored = rawPercents.map(p => Math.floor(p))
  let remainder = 100 - floored.reduce((a, b) => a + b, 0)
  const remainders = rawPercents.map((p, i) => ({ i, r: p - floored[i] }))
  remainders.sort((a, b) => b.r - a.r)
  for (let k = 0; k < remainder; k++) floored[remainders[k].i]++
  const gwiValues = floored.map(v => Math.max(1, v))
  const gwiSum = gwiValues.reduce((a, b) => a + b, 0)
  if (gwiSum > 100) {
    let excess = gwiSum - 100
    const sorted = gwiValues.map((v, i) => ({ i, v })).sort((a, b) => b.v - a.v)
    for (const s of sorted) {
      if (excess <= 0) break
      const canRemove = Math.min(excess, s.v - 1)
      gwiValues[s.i] -= canRemove
      excess -= canRemove
    }
  }

  return ajustados.map((j, i) => {
    const winProb = gwiValues[i]
    const tendencia = j.scoreAjustado < (j.historicalAvg ?? 0) - 1 ? 'up'
      : j.scoreAjustado > (j.historicalAvg ?? 0) + 1 ? 'down' : 'stable'
    const liderId    = ajustados.reduce((a, b) => a.scoreAjustado < b.scoreAjustado ? a : b).id
    const esLider    = j.id === liderId
    const liderData  = ajustados.find(a => a.id === liderId)!
    const diferencia = j.scoreAjustado - liderData.scoreAjustado
    let narrativa = ''
    if (hoyosRestantes === 0) narrativa = 'Ronda finalizada'
    else if (esLider && j.handicapIndex <= 8 && hoyosRestantes <= 4) narrativa = 'Ventaja sólida — consistencia garantiza'
    else if (esLider && j.handicapIndex >= 18 && hoyosRestantes <= 6) narrativa = 'Lidera pero varianza deja puerta abierta'
    else if (!esLider && diferencia <= j.sigma * 0.5) narrativa = 'Dentro del margen — todo puede cambiar'
    else if (!esLider && diferencia > j.sigma * 1.2) narrativa = `Necesita un rallye en ${hoyosRestantes} hoyos`
    else if (j.breakdown.patrones.valor > 1.5 && hoyosRestantes <= 9) narrativa = 'Patrón de colapso detectado aquí'
    else if (j.breakdown.cancha.confianza > 0.7 && j.breakdown.cancha.valor < -3) narrativa = 'Históricamente dominante en esta cancha'
    return {
      id: j.id, nombre: j.nombre,
      winProbability: Math.max(0, Math.min(100, winProb)),
      tendencia: tendencia as 'up' | 'down' | 'stable',
      volatilidad: j.volatilidad as 'baja' | 'media' | 'alta',
      narrativa, breakdown: j.breakdown,
    }
  })
}
