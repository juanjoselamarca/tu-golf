// Envío de un hoyo del scorer del organizador a `/api/game` (`upsert_score`) y la cuenta de las stats que el
// organizador tocó a mano. Sin React: lo usa `useScoreEntry` y se prueba suelto.
//
// Stats "tocadas": lo que el organizador fijó en la tarjeta abierta (`null` = la borró a propósito). Es lo ÚNICO
// que viaja en la foto de stats de un envío: lo que vino de la base no se reenvía, así una stat nunca cargada se
// omite (el servidor no la toca) en vez de mandarla null y borrarla. Cuando el servidor confirma un envío que se
// aplicó, lo tocado que sigue igual a lo enviado ya está en la base y deja de viajar.

import { DISPOSITIVO_GUARDADO, nuevaSecuencia } from '@/lib/red/orden-guardado'
import { CAMPO_STATS_NULL_BORRA } from '@/lib/api/codigos-game'

export type HoleStatPatch = Partial<{
  putts: number | null
  fairway_hit: boolean | null
  gir: boolean | null
}>

/** Lo tocado, atado a la ronda: si la tarjeta cambia, lo de la anterior no viaja a la nueva. */
export interface StatsTocadas {
  roundId: string | null
  porHoyo: Record<number, HoleStatPatch>
}

export const SIN_TOCAR: StatsTocadas = { roundId: null, porHoyo: {} }

/** Copia de lo tocado del hoyo, sin cambiar nada (para el deshacer, que no fija stats). */
export function leerTocadas(t: StatsTocadas, roundId: string, hole: number): HoleStatPatch {
  return t.roundId === roundId ? { ...t.porHoyo[hole] } : {}
}

/** Lo tocado con `patch` encima: queda como vigente y es la foto a enviar. Una clave `undefined` no cuenta. */
export function tocar(
  t: StatsTocadas, roundId: string, hole: number, patch: HoleStatPatch = {},
): { tocadas: StatsTocadas; foto: HoleStatPatch } {
  const porHoyo = t.roundId === roundId ? t.porHoyo : {}
  const foto: HoleStatPatch = { ...porHoyo[hole] }
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined) (foto as Record<string, unknown>)[k] = v
  }
  return { tocadas: { roundId, porHoyo: { ...porHoyo, [hole]: foto } }, foto }
}

/** Saca de lo tocado del hoyo lo que el servidor ya aplicó (la clave sigue con el valor enviado). Un cambio
 *  posterior al envío (otro valor) se conserva. */
export function reconciliar(t: StatsTocadas, roundId: string, hole: number, enviado: HoleStatPatch): StatsTocadas {
  if (t.roundId !== roundId || !t.porHoyo[hole]) return t
  const resto: HoleStatPatch = { ...t.porHoyo[hole] }
  for (const [k, v] of Object.entries(enviado)) {
    if ((resto as Record<string, unknown>)[k] === v) delete (resto as Record<string, unknown>)[k]
  }
  const porHoyo = { ...t.porHoyo }
  if (Object.keys(resto).length === 0) delete porHoyo[hole]
  else porHoyo[hole] = resto
  return { roundId, porHoyo }
}

/** `aplicado`: el servidor guardó ESTE envío (no lo descartó por haber uno más nuevo del dispositivo). */
export interface ResultadoEnvio {
  ok: boolean
  aplicado: boolean
}

/**
 * POST de un hoyo con orden por dispositivo y el campo que hace que un null de stat borre. No lanza: sin señal
 * `fetch` rechaza, y eso cuenta como un envío fallido (antes quedaba como promesa rechazada sin aviso).
 */
export async function enviarHoyo(campos: Record<string, unknown>): Promise<ResultadoEnvio> {
  try {
    const res = await fetch('/api/game', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'upsert_score',
        // Orden por dispositivo: un envío más viejo de este hoyo que llega tarde no pisa a uno más nuevo.
        seq: nuevaSecuencia(),
        dispositivo: DISPOSITIVO_GUARDADO,
        [CAMPO_STATS_NULL_BORRA]: true,
        ...campos,
      }),
    })
    if (!res.ok) return { ok: false, aplicado: false }
    const cuerpo = (await res.json().catch(() => null)) as { descartado?: unknown } | null
    return { ok: true, aplicado: cuerpo?.descartado !== true }
  } catch {
    return { ok: false, aplicado: false }
  }
}
