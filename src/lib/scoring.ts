// Re-export shim — lógica movida a @/golf/core/
export type { ModoJuego } from '@/golf/core/rules'
export { labelResultado, formatOverUnder } from '@/golf/core/rules'
export type { ResultadoHoyo, ResumenRonda } from '@/golf/core/scoring'
export {
  strokesRecibidosEnHoyo,
  scoreNetoHoyo,
  puntosStablefordHoyo,
  calcularResumenRonda,
  scorePrimario,
  ordenarJugadores,
} from '@/golf/core/scoring'
