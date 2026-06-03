/**
 * Stableford — helper centralizado R&A Rule 32.
 *
 * Fuente de verdad para el cálculo de puntos Stableford en toda la app.
 * No reimplementar la tabla en otras partes del código: importar de aquí.
 */

/**
 * Puntos Stableford por un hoyo según R&A Rule 32.1.
 *
 * @param scoreNeto golpes netos (después de aplicar ventaja de handicap)
 * @param par par del hoyo
 * @returns puntos: 0, 1, 2, 3, 4, 5
 */
export function puntosStablefordHoyo(scoreNeto: number, par: number): number {
  const diff = scoreNeto - par
  if (diff <= -3) return 5 // Albatross o mejor
  if (diff === -2) return 4 // Eagle
  if (diff === -1) return 3 // Birdie
  if (diff === 0) return 2 // Par
  if (diff === 1) return 1 // Bogey
  return 0 // Doble bogey o peor
}

export interface StablefordInput {
  scores: Record<string, number> | Record<number, number>
  roundHoles: number
  parMap: Record<number, number>
  courseHandicap: number
  strokeIndexMap: Record<number, number>
}

export interface StablefordResult {
  puntosTotales: number
  puntosPorHoyo: Record<number, number>
  holesPlayed: number
  parTotalRonda: number
  eagles: number
  birdies: number
  pares: number
  bogeys: number
  dobleOpeor: number
}

/**
 * Calcula puntos Stableford de una ronda completa respetando roundHoles.
 * NUNCA asume 18 hoyos.
 */
export function calcularStableford(input: StablefordInput): StablefordResult {
  const { scores, roundHoles, parMap, courseHandicap, strokeIndexMap } = input
  let puntosTotales = 0
  let holesPlayed = 0
  let parTotalRonda = 0
  let eagles = 0
  let birdies = 0
  let pares = 0
  let bogeys = 0
  let dobleOpeor = 0
  const puntosPorHoyo: Record<number, number> = {}

  for (let h = 1; h <= roundHoles; h++) {
    const par = parMap[h] ?? 4
    parTotalRonda += par

    const scoreRaw =
      (scores as Record<string, number>)[String(h)] ??
      (scores as Record<number, number>)[h]
    if (scoreRaw == null) continue

    holesPlayed++
    const si = strokeIndexMap[h] ?? h
    const ventaja = strokesRecibidosEnHoyo(courseHandicap, si, roundHoles)
    const neto = scoreRaw - ventaja
    const puntos = puntosStablefordHoyo(neto, par)

    puntosPorHoyo[h] = puntos
    puntosTotales += puntos

    const diff = neto - par
    if (diff <= -2) eagles++
    else if (diff === -1) birdies++
    else if (diff === 0) pares++
    else if (diff === 1) bogeys++
    else dobleOpeor++
  }

  return {
    puntosTotales,
    puntosPorHoyo,
    holesPlayed,
    parTotalRonda,
    eagles,
    birdies,
    pares,
    bogeys,
    dobleOpeor,
  }
}

/**
 * Strokes que recibe un jugador en un hoyo según R&A.
 * - Si courseHandicap >= roundHoles: recibe 1 golpe en todos, más 1 extra en los SI más bajos
 * - Si courseHandicap < roundHoles: recibe 1 solo en los SI 1..courseHandicap
 */
export function strokesRecibidosEnHoyo(
  courseHandicap: number,
  strokeIndex: number,
  roundHoles: number = 18,
): number {
  if (courseHandicap < 0) {
    const hcpAbs = Math.abs(Math.round(courseHandicap))
    // WHS Appendix E: el jugador plus DEVUELVE golpes al campo empezando por el
    // hoyo MÁS FÁCIL (stroke index más alto), no el más difícil. Un +2 en 18
    // hoyos devuelve en SI 18 y 17; en 9 hoyos, en SI 9 y 8.
    return strokeIndex >= roundHoles - hcpAbs + 1 ? -1 : 0
  }
  if (courseHandicap <= 0) return 0
  const maxSI = roundHoles
  const primeraVuelta = strokeIndex <= Math.min(courseHandicap, maxSI) ? 1 : 0
  if (courseHandicap <= maxSI) return primeraVuelta
  const restante2 = courseHandicap - maxSI
  const segundaVuelta = strokeIndex <= Math.min(restante2, maxSI) ? 1 : 0
  if (courseHandicap <= maxSI * 2) return primeraVuelta + segundaVuelta
  const restante3 = courseHandicap - maxSI * 2
  const terceraVuelta = strokeIndex <= restante3 ? 1 : 0
  return primeraVuelta + segundaVuelta + terceraVuelta
}
