// Envío de un sobre de hoyo del scorer del organizador a `/api/game` (`upsert_score`). Sin React y sin estado:
// arma el POST, lo corta a los `PLAZO_GUARDAR_HOYO_MS` y traduce la respuesta para `estado-hoyos`.

import { DISPOSITIVO_GUARDADO } from '@/lib/red/orden-guardado'
import { PLAZO_GUARDAR_HOYO_MS } from '@/lib/red/plazos'
import { CAMPO_STATS_NULL_BORRA } from '@/lib/api/codigos-game'
import { clasificarRespuestaScore, esRechazoDeDatos, STATUS_CON_CODE } from '@/lib/api/respuesta-score'
import type { RespuestaSobre, Sobre } from './estado-hoyos'

interface CuerpoRespuesta {
  code?: string
  descartado?: boolean
  totalGross?: unknown
  totalNet?: unknown
  totalPoints?: unknown
}

function totalesDe(c: CuerpoRespuesta): RespuestaSobre['totales'] {
  const { totalGross, totalNet, totalPoints } = c
  if (typeof totalGross !== 'number' || typeof totalNet !== 'number' || typeof totalPoints !== 'number') return undefined
  return { totalGross, totalNet, totalPoints }
}

/**
 * POST de un hoyo. No lanza. Sin respuesta (corte, red caída, 5xx, 429) y `descartado` son `sin_respuesta`: el
 * estado reenvía el contenido vigente con secuencia nueva. Un 401/403/409/400/404 es un rechazo de este contenido.
 * El neto y los puntos no viajan: el servidor los deriva del bruto (`upsertScore`).
 * Corte con `AbortController` + `setTimeout` propio: `AbortSignal.timeout` no existe en iOS 15.
 */
export async function enviarHoyo(tournamentId: string, sobre: Sobre): Promise<RespuestaSobre> {
  const control = new AbortController()
  const plazo = setTimeout(() => control.abort(), PLAZO_GUARDAR_HOYO_MS)
  try {
    const res = await fetch('/api/game', {
      method: 'POST',
      signal: control.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_score',
        seq: sobre.seq,
        dispositivo: DISPOSITIVO_GUARDADO,
        [CAMPO_STATS_NULL_BORRA]: true,
        tournament_id: tournamentId,
        round_id: sobre.roundId,
        hole_number: sobre.hole,
        par: sobre.par,
        gross_score: sobre.gross,
        ...sobre.stats,
      }),
    })
    const cuerpo: CuerpoRespuesta = res.ok || STATUS_CON_CODE.includes(res.status)
      ? (((await res.json().catch(() => null)) ?? {}) as CuerpoRespuesta)
      : {}
    const lectura = clasificarRespuestaScore(res.status, cuerpo.code, cuerpo.descartado === true)
    if (lectura === 'ok') return { lectura: 'ok', totales: totalesDe(cuerpo) }
    if (esRechazoDeDatos(res.status)) return { lectura: { rechazo: 'datos' } }
    if (lectura === 'descartado' || lectura === 'reintentar') return { lectura: 'sin_respuesta' }
    return { lectura: { rechazo: lectura } }
  } catch {
    return { lectura: 'sin_respuesta' }
  } finally {
    clearTimeout(plazo)
  }
}
