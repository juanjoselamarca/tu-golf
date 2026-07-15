/**
 * Tipos compartidos para /perfil/historial.
 *
 * Refactor 'el que toca, ordena' — extraído del page.tsx monolítico.
 * Post-RSC (jul-2026), los tipos de datos viven en su fuente canónica y acá
 * solo se RE-exportan (regla "un concepto, una fuente"):
 *   - HistoricalRound → src/lib/data/historial.ts (capa de datos, dueña de la fila)
 *   - HistorialStats / BestRound → src/golf/stats/historial.ts (matemática de golf)
 */

export type { HistoricalRound } from '@/lib/data/historial'
export type { HistorialStats, BestRound } from '@/golf/stats/historial'

export interface Pill {
  label: string
  value: string
}
