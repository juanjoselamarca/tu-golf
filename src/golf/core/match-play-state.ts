import { calcularMatchPlay } from '../formats/match-play'
export { calcularMatchPlay }

/**
 * Capitaliza cada palabra de un nombre.
 * "juan ruiz" → "Juan Ruiz"
 */
export function capitalizarNombre(nombre: string): string {
  return nombre
    .trim()
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ')
}

export interface MatchPlayDisplayState {
  state: number // + = A gana, - = B gana
  holesRemaining: number
  isFinished: boolean
  isDormie: boolean
  isAllSquare: boolean
  winnerName: string | null
  loserName: string | null
  resultText: string // "3&2", "1 UP", "AS", "Dormie"
}

/**
 * Convierte estado interno de match play a texto visible.
 */
export function describirMatchState(params: {
  state: number
  hoyoActual: number
  roundHoles: number
  nombreA: string
  nombreB: string
}): MatchPlayDisplayState {
  const { state, hoyoActual, roundHoles, nombreA, nombreB } = params
  const holesRemaining = Math.max(0, roundHoles - hoyoActual)
  const absState = Math.abs(state)
  const capA = capitalizarNombre(nombreA)
  const capB = capitalizarNombre(nombreB)

  // Match finalizado por diferencia mayor a restantes (antes de llegar al último hoyo)
  if (hoyoActual < roundHoles && absState > holesRemaining) {
    const winnerName = state > 0 ? capA : capB
    const loserName = state > 0 ? capB : capA
    return {
      state,
      holesRemaining,
      isFinished: true,
      isDormie: false,
      isAllSquare: false,
      winnerName,
      loserName,
      resultText: `${absState}&${holesRemaining}`,
    }
  }

  // Fin de ronda: match finalizado
  if (hoyoActual >= roundHoles) {
    if (state === 0) {
      return {
        state,
        holesRemaining: 0,
        isFinished: true,
        isDormie: false,
        isAllSquare: true,
        winnerName: null,
        loserName: null,
        resultText: 'AS',
      }
    }
    const winnerName = state > 0 ? capA : capB
    const loserName = state > 0 ? capB : capA
    return {
      state,
      holesRemaining: 0,
      isFinished: true,
      isDormie: false,
      isAllSquare: false,
      winnerName,
      loserName,
      resultText: `${absState} UP`,
    }
  }

  // En curso
  const isDormie = absState > 0 && absState === holesRemaining
  const leaderName = state > 0 ? capA : state < 0 ? capB : null

  let resultText: string
  if (state === 0) {
    resultText = 'AS'
  } else if (isDormie) {
    resultText = `${leaderName} está dormie`
  } else {
    resultText = `${leaderName} ${absState} UP`
  }

  return {
    state,
    holesRemaining,
    isFinished: false,
    isDormie,
    isAllSquare: state === 0,
    winnerName: null,
    loserName: null,
    resultText,
  }
}
