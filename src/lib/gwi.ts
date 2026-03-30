// Re-export shim — lógica movida a @/golf/stats/gwi
export type { ProbHoyo, JugadorGWIInput, GWIResult } from '@/golf/stats/gwi'
export {
  varianzaPorHoyo,
  sigmaTotal,
  probResultadoHoyo,
  calcularGWI,
} from '@/golf/stats/gwi'
