// ─── Drives del scramble con respaldo offline ─────────────────────────────────
//
// Mismo patrón que los golpes del scorer de grupo y las marcas de la Timba (`crearColaDePendientes`, caída
// 04-oct): cada drive queda pendiente en el teléfono hasta que el servidor confirma ESE valor, y al volver la
// señal se reenvía. Cola propia (`DRIVES_PEND_KEY`): el reenvío de golpes nunca manda un drive como golpe.
//
// Valor guardado por equipo y hoyo: el índice del jugador en `drive_jugadores`, o `SIN_DRIVE` (-1) = desmarcar.
// La RPC no lleva secuencia (último valor gana), así que el envío va EN SERIE por ronda: dos envíos en paralelo
// podrían llegar al revés y dejar en el servidor el drive viejo. Con la cola en serie y la confirmación por valor
// exacto, lo último que se tocó es lo último que se manda.

import { crearColaDePendientes, DRIVES_PEND_KEY } from './score-storage'
import { esRechazoDefinitivoDeTimba } from '@/lib/data/ronda-libre-cierre'
import { marcarDriveEquipo, type RondaLibreWriteClient } from '@/lib/data/ronda-libre-scores'
import type { PostgrestError } from '@supabase/supabase-js'

const cola = crearColaDePendientes(DRIVES_PEND_KEY)

/** Valor en la cola para «sin drive en este hoyo» (desmarcar). */
export const SIN_DRIVE = -1

export interface DrivePendiente {
  equipoId: string
  hoyo: number
  /** Índice del jugador, o `SIN_DRIVE`. */
  valor: number
}

/** Un envío que el servidor resolvió: `drives` = los drives del equipo como quedaron (crudos, para `leerDrives`). */
export interface DriveConfirmado extends DrivePendiente {
  drives: unknown
}

export interface ResultadoDrives {
  confirmados: DriveConfirmado[]
  /** Rechazo definitivo (`esRechazoDefinitivoDeTimba`): salió de la cola y no cuenta. */
  rechazados: Array<{ drive: DrivePendiente; code: string }>
  /** Quedan en la cola (sin señal, plazo, 5xx, sesión vencida, ronda cerrada que se puede reabrir). */
  pendientes: number
}

/** Pendientes de la ronda, por equipo y hoyo. */
export function drivesPendientes(codigo: string): DrivePendiente[] {
  const out: DrivePendiente[] = []
  for (const [equipoId, hoyos] of Object.entries(cola.leer(codigo))) {
    for (const [h, valor] of Object.entries(hoyos)) {
      const hoyo = Number(h)
      if (!Number.isInteger(hoyo) || hoyo < 1 || typeof valor !== 'number' || !Number.isInteger(valor) || valor < SIN_DRIVE) continue
      out.push({ equipoId, hoyo, valor })
    }
  }
  return out
}

export function hayDrivesPendientes(codigo: string): boolean {
  return cola.hay(codigo)
}

const quedaPendiente = (error: PostgrestError | null) => !!error && !esRechazoDefinitivoDeTimba(error)

/** Un envío a la vez por ronda (ver arriba). */
const enCurso = new Map<string, Promise<unknown>>()
function enSerie<T>(codigo: string, tarea: () => Promise<T>): Promise<T> {
  const previa = enCurso.get(codigo) ?? Promise.resolve()
  const siguiente = previa.then(tarea, tarea)
  const fin = siguiente.catch(() => undefined)
  enCurso.set(codigo, fin)
  void fin.then(() => { if (enCurso.get(codigo) === fin) enCurso.delete(codigo) })
  return siguiente
}

/**
 * Manda lo pendiente, en serie. Cada drive se lee de la cola al momento de mandarlo: si se cambió mientras
 * esperaba turno, va el valor nuevo, y si ya se confirmó, no se manda. Se detiene en el primero que falla sin
 * rechazo definitivo (sin señal, los demás fallarían igual).
 */
async function enviarPendientes(supabase: RondaLibreWriteClient, codigo: string, solo?: { equipoId: string; hoyo: number }): Promise<ResultadoDrives> {
  const confirmados: DriveConfirmado[] = []
  const rechazados: ResultadoDrives['rechazados'] = []
  const lista = drivesPendientes(codigo).filter(d => !solo || (d.equipoId === solo.equipoId && d.hoyo === solo.hoyo))
  for (const { equipoId, hoyo } of lista) {
    const valor = cola.leer(codigo)[equipoId]?.[String(hoyo)]
    if (typeof valor !== 'number') continue
    const r = await marcarDriveEquipo(supabase, { codigo, equipoId, hoyo, jugador: valor === SIN_DRIVE ? null : valor })
    if (quedaPendiente(r.error)) break
    cola.confirmar(codigo, equipoId, { [hoyo]: valor })
    if (r.error) rechazados.push({ drive: { equipoId, hoyo, valor }, code: r.error.code })
    else confirmados.push({ equipoId, hoyo, valor, drives: r.drives })
  }
  return { confirmados, rechazados, pendientes: drivesPendientes(codigo).length }
}

/**
 * Marca (o, con `jugador: null`, desmarca) el drive del equipo en un hoyo: queda pendiente en el teléfono antes del
 * primer `await` (la pantalla cambia al toque, con o sin señal) y se manda en serie.
 */
export function marcarDriveConRespaldo(
  supabase: RondaLibreWriteClient,
  codigo: string,
  d: { equipoId: string; hoyo: number; jugador: number | null },
): Promise<ResultadoDrives> {
  cola.marcar(codigo, d.equipoId, { [d.hoyo]: d.jugador ?? SIN_DRIVE })
  return enSerie(codigo, () => enviarPendientes(supabase, codigo, { equipoId: d.equipoId, hoyo: d.hoyo }))
}

/** Reenvía todo lo pendiente de la ronda (al abrir o al volver la señal). */
export function reenviarDrivesPendientes(supabase: RondaLibreWriteClient, codigo: string): Promise<ResultadoDrives> {
  return enSerie(codigo, () => enviarPendientes(supabase, codigo))
}
