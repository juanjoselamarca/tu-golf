// src/lib/mi-golf/tendencia.ts
import type { HistoricalRound, Tendencia } from './types'

const VENTANA_DIAS = 30
const MINIMO_RONDAS = 5
const UMBRAL_FLAT = 0.2

export function calcularTendencia(
  indiceActual: number | null | undefined,
  historico: HistoricalRound[]
): Tendencia {
  if (indiceActual == null) return null

  const limiteTimestamp = Date.now() - VENTANA_DIAS * 86400000
  const enVentana = historico.filter((r) => {
    if (!r.played_at || r.diferencial == null) return false
    const t = new Date(r.played_at + 'T12:00:00').getTime()
    return t >= limiteTimestamp
  })

  if (enVentana.length < MINIMO_RONDAS) return null

  const promedioDiferencial =
    enVentana.reduce((sum, r) => sum + (r.diferencial ?? 0), 0) / enVentana.length

  const delta = indiceActual - promedioDiferencial

  let direccion: 'up' | 'down' | 'flat'
  if (Math.abs(delta) < UMBRAL_FLAT) direccion = 'flat'
  else if (delta > 0) direccion = 'up'
  else direccion = 'down'

  return {
    direccion,
    delta: Math.abs(delta),
    dias: VENTANA_DIAS,
  }
}
