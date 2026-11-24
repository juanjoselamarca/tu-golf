// ─── Capa de datos — un celular por equipo (scramble rápido) ────────────────
//
// Únicas llamadas del cliente a `reclamar_equipo_de_ronda` y `liberar_equipo_de_ronda` (migración
// 20261123100000_scramble_equipos_de_club). Cada respuesta vuelve como un resultado con el copy para el usuario:
// la pantalla no interpreta códigos SQL. Contrato de errores: scripts/ci/pruebas-sql/equipos-de-club.sql.
//   P0001 la ronda o el equipo no existe · P0002 la ronda no está en curso ·
//   P0003 sin sesión, demo, ronda de un celular, de torneo, equipo no de club o (liberar) no eres creador ni anotador.
// Las reglas de quién anota qué viven en `@/golf/ronda-libre/anotador-de-equipo`.

import type { PostgrestError, SupabaseClient } from '@supabase/supabase-js'
import { conTimeout } from '@/lib/red/con-timeout'
import { RONDA_ERRCODE } from '@/lib/data/ronda-libre-cierre'
import { captureError } from '@/lib/error-tracking'
import { nombreDelAnotador } from '@/golf/ronda-libre/anotador-de-equipo'

/** Plazo de las dos RPC: el celular está en la cancha, con señal de cancha. */
const PLAZO_ANOTADOR_MS = 12_000

/** Copy cuando el servidor rechaza los golpes de un equipo que este celular ya no anota (lo liberaron). */
export const MENSAJE_YA_NO_ANOTAS = 'Ya no anotas este equipo.'

/** Copy cuando «Dejar este equipo» no puede subir antes lo anotado (sin señal): no se suelta con golpes en el teléfono. */
export const MENSAJE_DEJAR_CON_PENDIENTES = 'Hay golpes sin subir. Espera señal y vuelve a intentar.'

/** Copy cuando otro celular ganó el equipo. */
export function mensajeEquipoTomado(anotadorNombre: string | null | undefined): string {
  return `Ese equipo ya lo anota ${nombreDelAnotador({ anotador_nombre: anotadorNombre ?? null })}. Elige otro.`
}

export type ResultadoReclamo =
  | { estado: 'ok' }
  | { estado: 'tomado'; mensaje: string }
  | { estado: 'ya_tienes_equipo'; equipoId: string | null }
  | { estado: 'error'; mensaje: string; ronda: 'viva' | 'cerrada' | 'sin_permiso' | 'sin_respuesta' }

export type ResultadoLiberar =
  | { estado: 'ok' }
  | { estado: 'error'; mensaje: string }

type Rpc = Pick<SupabaseClient, 'rpc'>

async function llamar(supabase: Rpc, fn: string, args: Record<string, unknown>): Promise<{ data: unknown; error: PostgrestError | { code: '' } | null }> {
  try {
    const { data, error } = await conTimeout(supabase.rpc(fn, args), PLAZO_ANOTADOR_MS)
    return { data, error }
  } catch {
    return { data: null, error: { code: '' } }
  }
}

function mensajeDeError(code: string | undefined): { mensaje: string; ronda: 'viva' | 'cerrada' | 'sin_permiso' | 'sin_respuesta' } {
  if (code === RONDA_ERRCODE.FINALIZED) return { mensaje: 'La ronda ya terminó.', ronda: 'cerrada' }
  if (code === RONDA_ERRCODE.NOT_FOUND) return { mensaje: 'Ese equipo ya no está en la ronda.', ronda: 'viva' }
  if (code === RONDA_ERRCODE.FORBIDDEN || code === '42501') return { mensaje: 'En esta ronda no puedes anotar un equipo.', ronda: 'sin_permiso' }
  return { mensaje: 'Sin conexión. Prueba de nuevo.', ronda: 'sin_respuesta' }
}

/** Toma un equipo para anotarlo desde este celular. Nunca lanza. */
export async function reclamarEquipoDeRonda(supabase: Rpc, codigo: string, equipoId: string): Promise<ResultadoReclamo> {
  const { data, error } = await llamar(supabase, 'reclamar_equipo_de_ronda', { p_codigo: codigo, p_equipo_id: equipoId })
  if (error) {
    const r = mensajeDeError(error.code)
    if (r.ronda === 'sin_respuesta' && error.code) {
      void captureError(new Error(`reclamar_equipo_de_ronda: ${error.code}`), { context: 'ronda_libre.reclamar_equipo', level: 'warning', meta: { codigo } })
    }
    return { estado: 'error', ...r }
  }
  const d = (data ?? {}) as { estado?: string; anotador_nombre?: string | null; equipo_id?: string | null }
  if (d.estado === 'ok') return { estado: 'ok' }
  if (d.estado === 'tomado') return { estado: 'tomado', mensaje: mensajeEquipoTomado(d.anotador_nombre) }
  if (d.estado === 'ya_tienes_equipo') return { estado: 'ya_tienes_equipo', equipoId: d.equipo_id ?? null }
  void captureError(new Error('reclamar_equipo_de_ronda: respuesta desconocida'), { context: 'ronda_libre.reclamar_equipo', meta: { codigo, estado: d.estado ?? null } })
  return { estado: 'error', mensaje: 'Sin conexión. Prueba de nuevo.', ronda: 'sin_respuesta' }
}

/** Deja un equipo sin anotador (el creador o el propio anotador): vuelve al celular del creador. Nunca lanza. */
export async function liberarEquipoDeRonda(supabase: Rpc, codigo: string, equipoId: string): Promise<ResultadoLiberar> {
  const { error } = await llamar(supabase, 'liberar_equipo_de_ronda', { p_codigo: codigo, p_equipo_id: equipoId })
  if (!error) return { estado: 'ok' }
  const r = mensajeDeError(error.code)
  if (r.ronda === 'sin_respuesta' && error.code) {
    void captureError(new Error(`liberar_equipo_de_ronda: ${error.code}`), { context: 'ronda_libre.liberar_equipo', level: 'warning', meta: { codigo } })
  }
  return { estado: 'error', mensaje: r.ronda === 'sin_permiso' ? 'Solo quien creó la ronda o quien anota ese equipo puede liberarlo.' : r.mensaje }
}
