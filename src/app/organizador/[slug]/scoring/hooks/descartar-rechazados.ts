// "Descartar" hoyos rechazados del scorer del organizador: sólo los del grupo pedido y sólo con un motivo que
// reintentar no arregla (`esRechazoPermanente`). Si alguno pudo quedar escrito (un envío anterior sin respuesta),
// primero se lee la base: sin esa lectura no se descarta nada, porque se mostraría un valor que quizá no es el
// guardado.

import { esRechazoPermanente } from '@/lib/api/respuesta-score'
import type { EstadoHoyos, FilaBase } from './estado-hoyos'

export type ResultadoDescarte = 'descartado' | 'sin_lectura' | 'nada'

export async function descartarRechazados(
  store: Pick<EstadoHoyos, 'vista' | 'descartar' | 'enviosDe'>,
  roundId: string,
  holes: readonly number[],
  leerBase: (roundId: string) => Promise<FilaBase[]>,
): Promise<ResultadoDescarte> {
  const vista = store.vista(roundId)
  const elegibles = holes.filter((h) => vista[h]?.estado === 'rechazado' && esRechazoPermanente(vista[h]?.motivo))
  if (elegibles.length === 0) return 'nada'
  let filas: FilaBase[] | null = null
  // Envíos de cada hoyo al pedir la lectura: si sale otro mientras tanto (un Reintentar), la lectura ya no dice qué
  // quedó guardado y ese hoyo no se descarta.
  const enviosAlLeer = new Map(elegibles.map((h) => [h, store.enviosDe(roundId, h)]))
  if (elegibles.some((h) => vista[h]?.quizaAplicado)) {
    try {
      filas = await leerBase(roundId)
    } catch {
      return 'sin_lectura'
    }
  }
  let alguno = false
  for (const h of elegibles) {
    if (filas && store.enviosDe(roundId, h) !== enviosAlLeer.get(h)) continue
    // Sin fila en la base = el hoyo no tiene golpe (la lectura trae sólo hoyos con golpe).
    const leida = filas ? (filas.find((f) => f.hole_number === h) ?? null) : undefined
    if (store.descartar(roundId, h, leida)) alguno = true
  }
  return alguno ? 'descartado' : 'nada'
}
