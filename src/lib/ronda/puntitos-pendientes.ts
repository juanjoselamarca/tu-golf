// ─── Marcas de puntos especiales (Timba libre) con respaldo offline ───────────
//
// Mismo patrón que los golpes del scorer de grupo (`marcarPendientes` / `confirmarPendientes` de
// score-storage.ts, caída 04-oct): cada marca queda pendiente en el teléfono hasta que el servidor la
// confirma, y al volver la señal se reenvía. Misma cola (`crearColaDePendientes`), con su propia clave para
// que el reenvío de golpes nunca mande una marca como golpe.
//
// Valor guardado por (punto, jugador) y hoyo: `+orden` = marcar, `−orden` = quitar. `orden` crece con cada
// marca (`nuevaSecuencia`) y define el orden del reenvío: "vale el último greenie" depende de él.

import { crearColaDePendientes, PUNTITOS_PEND_KEY } from './score-storage'
import { esRechazoDefinitivo } from '@/lib/data/ronda-libre-cierre'
import {
  marcarPuntitoTimba,
  nuevaSecuencia,
  type RondaLibreWriteClient,
} from '@/lib/data/ronda-libre-scores'
import type { PostgrestError } from '@supabase/supabase-js'

const cola = crearColaDePendientes(PUNTITOS_PEND_KEY)
const SEP = '|'
const idDe = (puntitoId: string, jugadorId: string) => `${puntitoId}${SEP}${jugadorId}`

export interface MarcaDeTimba {
  jugadorId: string
  puntitoId: string
  hoyo: number
  marcar: boolean
  /** El greenie es uno por hoyo: una marca nueva deja sin efecto las pendientes de otros jugadores. */
  esGreenie: boolean
}

export interface MarcaPendiente {
  jugadorId: string
  puntitoId: string
  hoyo: number
  marcar: boolean
  /** Valor guardado tal cual (se confirma por valor exacto). */
  valor: number
}

function registrar(codigo: string, m: MarcaDeTimba, orden: number): number {
  if (m.esGreenie) {
    // El greenie nuevo reemplaza en el servidor a cualquier otro de ese hoyo: reenviar uno viejo lo revertiría.
    const p = cola.leer(codigo)
    for (const [id, hoyos] of Object.entries(p)) {
      if (id.startsWith(`${m.puntitoId}${SEP}`)) delete hoyos[String(m.hoyo)]
    }
    cola.escribir(codigo, p)
  }
  const valor = m.marcar ? orden : -orden
  cola.marcar(codigo, idDe(m.puntitoId, m.jugadorId), { [m.hoyo]: valor })
  return valor
}

/** Pendientes en el orden en que se marcaron. */
export function marcasPendientes(codigo: string): MarcaPendiente[] {
  const out: MarcaPendiente[] = []
  for (const [id, hoyos] of Object.entries(cola.leer(codigo))) {
    const corte = id.indexOf(SEP)
    if (corte <= 0) continue
    const puntitoId = id.slice(0, corte)
    const jugadorId = id.slice(corte + 1)
    for (const [h, valor] of Object.entries(hoyos)) {
      const hoyo = Number(h)
      if (!Number.isInteger(hoyo) || typeof valor !== 'number' || valor === 0) continue
      out.push({ jugadorId, puntitoId, hoyo, marcar: valor > 0, valor })
    }
  }
  return out.sort((a, b) => Math.abs(a.valor) - Math.abs(b.valor))
}

export function hayMarcasPendientes(codigo: string): boolean {
  return cola.hay(codigo)
}

/**
 * Sale de pendientes solo si el servidor la guardó o la rechazó en forma definitiva (`esRechazoDefinitivo`).
 * Cualquier otro error (sin red = `{ code: '', status: 0 }`, plazo vencido, 5xx, sesión vencida) la deja pendiente.
 */
const quedaPendiente = (error: PostgrestError | null) => !!error && !esRechazoDefinitivo(error)

async function enviar(supabase: RondaLibreWriteClient, codigo: string, m: MarcaPendiente) {
  const r = await marcarPuntitoTimba(supabase, {
    codigo, jugadorId: m.jugadorId, hoyo: m.hoyo, puntitoId: m.puntitoId, marcar: m.marcar, seq: nuevaSecuencia(),
  })
  if (!quedaPendiente(r.error)) cola.confirmar(codigo, idDe(m.puntitoId, m.jugadorId), { [m.hoyo]: m.valor })
  return r
}

/** Marca (o quita) un punto especial: queda pendiente en el teléfono y se envía. */
export async function marcarPuntitoConRespaldo(
  supabase: RondaLibreWriteClient,
  codigo: string,
  m: MarcaDeTimba,
): Promise<{ error: PostgrestError | null }> {
  const valor = registrar(codigo, m, nuevaSecuencia())
  return enviar(supabase, codigo, { jugadorId: m.jugadorId, puntitoId: m.puntitoId, hoyo: m.hoyo, marcar: m.marcar, valor })
}

/**
 * Reenvía las marcas pendientes en orden (al abrir o al volver la señal). Se detiene en la primera que falla sin
 * rechazo definitivo: seguir mandando las siguientes las aplicaría fuera de orden.
 */
export async function reenviarPuntitosPendientes(
  supabase: RondaLibreWriteClient,
  codigo: string,
): Promise<{ enviadas: number; pendientes: number }> {
  const lista = marcasPendientes(codigo)
  let enviadas = 0
  for (const m of lista) {
    const r = await enviar(supabase, codigo, m)
    if (quedaPendiente(r.error)) break
    enviadas++
  }
  return { enviadas, pendientes: marcasPendientes(codigo).length }
}
