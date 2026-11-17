// src/lib/mi-golf/tendencia.ts
import type { HistoricalRound, Tendencia } from './types'

const VENTANA_DIAS = 30
const MINIMO_RONDAS_POR_VENTANA = 3
const UMBRAL_FLAT = 0.2
const DIA_MS = 86400000

/**
 * Tendencia del juego: promedio de diferenciales de los últimos 30 días contra el de
 * los 30 anteriores. Compara rondas con rondas y NO recibe ningún índice: antes restaba
 * `índice − promedio de diferenciales`, y con el índice oficial (que las rondas no
 * mueven, o que el jugador cargó a mano hace meses) decía "tu diferencial bajó 4.2"
 * sin que nada hubiera bajado (revisión PR2 Ola 1, 16-nov-2026).
 *
 * `up` = mejora (los diferenciales recientes son más bajos).
 */
export function calcularTendencia(historico: HistoricalRound[], ahora: number = Date.now()): Tendencia {
  const recientes: number[] = []
  const anteriores: number[] = []
  for (const r of historico) {
    if (!r.played_at || r.diferencial == null) continue
    const edad = ahora - new Date(r.played_at + 'T12:00:00').getTime()
    if (edad < 0) continue
    if (edad < VENTANA_DIAS * DIA_MS) recientes.push(r.diferencial)
    else if (edad < 2 * VENTANA_DIAS * DIA_MS) anteriores.push(r.diferencial)
  }
  if (recientes.length < MINIMO_RONDAS_POR_VENTANA || anteriores.length < MINIMO_RONDAS_POR_VENTANA) return null

  const prom = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const delta = prom(anteriores) - prom(recientes)

  const direccion: 'up' | 'down' | 'flat' =
    Math.abs(delta) < UMBRAL_FLAT ? 'flat' : delta > 0 ? 'up' : 'down'
  return { direccion, delta: Math.abs(delta), dias: VENTANA_DIAS }
}
