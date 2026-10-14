/**
 * Índice Golfers+ con la Regla 5.2 del WHS: promedio de los mejores diferenciales de las
 * últimas 20 rondas más el ajuste de la tabla 5.2a, redondeado a un decimal. Sin el × 0.96
 * de la fórmula USGA anterior a 2020.
 *
 * Gemela de la RPC `calcular_indice_golfers`, que es la que guarda el índice:
 * `canary-indice-whs-sql.test.ts` exige que la migración use esta misma tabla.
 */

/** Tabla 5.2a: con N diferenciales, cuántos de los mejores se promedian y qué ajuste se suma. */
export const TABLA_WHS_5_2 = [
  { desde: 3, hasta: 3, usar: 1, ajuste: -2 },
  { desde: 4, hasta: 4, usar: 1, ajuste: -1 },
  { desde: 5, hasta: 5, usar: 1, ajuste: 0 },
  { desde: 6, hasta: 6, usar: 2, ajuste: -1 },
  { desde: 7, hasta: 8, usar: 2, ajuste: 0 },
  { desde: 9, hasta: 11, usar: 3, ajuste: 0 },
  { desde: 12, hasta: 14, usar: 4, ajuste: 0 },
  { desde: 15, hasta: 16, usar: 5, ajuste: 0 },
  { desde: 17, hasta: 18, usar: 6, ajuste: 0 },
  { desde: 19, hasta: 19, usar: 7, ajuste: 0 },
  { desde: 20, hasta: 20, usar: 8, ajuste: 0 },
] as const

/** Fila de la tabla para `cantidad` diferenciales; null con menos de 3 (sin índice). */
export function filaTablaWHS(cantidad: number): (typeof TABLA_WHS_5_2)[number] | null {
  const n = Math.min(cantidad, 20)
  return TABLA_WHS_5_2.find(f => n >= f.desde && n <= f.hasta) ?? null
}

/** Índice desde los diferenciales de las últimas 20 rondas válidas; null con menos de 3. */
export function calcularIndiceGolfersLocal(diferenciales: readonly number[]): number | null {
  const fila = filaTablaWHS(diferenciales.length)
  if (!fila) return null
  // En centésimas enteras (la columna es numeric(5,2)): redondea igual que ROUND de Postgres
  // (mitad lejos de cero), sin el error de coma flotante de toFixed.
  const centesimas = diferenciales.map(d => Math.round(d * 100)).sort((a, b) => a - b).slice(0, fila.usar)
  const total = centesimas.reduce((a, b) => a + b, 0) + fila.ajuste * 100 * fila.usar
  const divisor = 10 * fila.usar
  const decimas = Math.sign(total) * Math.floor((2 * Math.abs(total) + divisor) / (2 * divisor))
  return decimas === 0 ? 0 : decimas / 10
}
