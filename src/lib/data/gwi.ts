// ─── Capa de datos — GWI (servidor) ─────────────────────────────────────────
// Historial y patrones del coach de los jugadores: los inputs PRIVADOS del GWI.
// Sólo lo usan `gwi-ronda-libre.ts` y `gwi-torneo.ts`, que calculan el GWI en el
// servidor y devuelven el resultado público (`GWIResponse`). Nunca se exponen.

import type { SupabaseClient } from '@supabase/supabase-js'
import { TIPOS_PATRON_GWI, type PatronGWIRow, type RondaHistoricaGWI } from '@/golf/stats/gwi-historial'
import { MAX_FILAS_POSTGREST } from './postgrest-limites'

export interface DatosPrivadosGWI {
  historialPorUsuario: Map<string, RondaHistoricaGWI[]>
  patronesPorUsuario: Map<string, PatronGWIRow[]>
}

type Cliente = Pick<SupabaseClient, 'from'>
type ConUsuario<T> = T & { user_id: string }

/** Usuarios consultados en paralelo por tanda en el camino por usuario. */
const USUARIOS_POR_TANDA = 8
/** Tope de patrones activos por usuario en el camino por usuario. */
const PATRONES_POR_USUARIO = 50

const COLS_HISTORIAL = 'total_gross, course_name, holes_played, scores'
const COLS_PATRONES = 'pattern_type, confidence, metadata'

/**
 * Historial (más reciente primero, a lo más `rondasPorUsuario` por usuario) y
 * patrones activos de cada usuario.
 *
 * Camino normal (toda ronda libre): UNA query batch por tabla y el recorte por
 * usuario en memoria — 2 queries por request, no 2 por jugador (Supabase Nano).
 * Si el batch no puede traer todo (usuarios × límite > tope de PostgREST) o la
 * respuesta llega justo al tope (puede venir truncada en silencio), cae al
 * camino por usuario con `.limit` explícito, en tandas.
 */
export async function fetchDatosPrivadosGWI(
  supabase: Cliente,
  userIds: string[],
  rondasPorUsuario: number,
): Promise<DatosPrivadosGWI> {
  const unicos = Array.from(new Set(userIds))
  if (unicos.length === 0) return { historialPorUsuario: new Map(), patronesPorUsuario: new Map() }

  if (unicos.length * rondasPorUsuario <= MAX_FILAS_POSTGREST) {
    const batch = await fetchEnBatch(supabase, unicos, rondasPorUsuario)
    if (batch) return batch
  }
  return fetchPorUsuario(supabase, unicos, rondasPorUsuario)
}

/** `null` = alguna de las dos respuestas llegó al tope (posible truncamiento). */
async function fetchEnBatch(supabase: Cliente, userIds: string[], rondasPorUsuario: number): Promise<DatosPrivadosGWI | null> {
  const [{ data: hist }, { data: pats }] = await Promise.all([
    supabase
      .from('historical_rounds')
      .select(`user_id, ${COLS_HISTORIAL}`)
      .in('user_id', userIds)
      .not('total_gross', 'is', null)
      .order('played_at', { ascending: false })
      .limit(MAX_FILAS_POSTGREST),
    supabase
      .from('player_patterns')
      .select(`user_id, ${COLS_PATRONES}`)
      .in('user_id', userIds)
      .eq('status', 'active')
      .in('pattern_type', [...TIPOS_PATRON_GWI])
      .limit(MAX_FILAS_POSTGREST),
  ])
  const filasHist = (hist ?? []) as Array<ConUsuario<RondaHistoricaGWI>>
  const filasPats = (pats ?? []) as Array<ConUsuario<PatronGWIRow>>
  if (filasHist.length >= MAX_FILAS_POSTGREST || filasPats.length >= MAX_FILAS_POSTGREST) return null

  const historialPorUsuario = new Map<string, RondaHistoricaGWI[]>(userIds.map(u => [u, []]))
  const patronesPorUsuario = new Map<string, PatronGWIRow[]>(userIds.map(u => [u, []]))
  for (const { user_id, ...r } of filasHist) {
    const arr = historialPorUsuario.get(user_id)
    // Ya vienen de la más reciente a la más antigua: se quedan las primeras N.
    if (arr && arr.length < rondasPorUsuario) arr.push(r)
  }
  for (const { user_id, ...p } of filasPats) patronesPorUsuario.get(user_id)?.push(p)
  return { historialPorUsuario, patronesPorUsuario }
}

async function fetchPorUsuario(supabase: Cliente, userIds: string[], rondasPorUsuario: number): Promise<DatosPrivadosGWI> {
  const historialPorUsuario = new Map<string, RondaHistoricaGWI[]>()
  const patronesPorUsuario = new Map<string, PatronGWIRow[]>()
  for (let i = 0; i < userIds.length; i += USUARIOS_POR_TANDA) {
    await Promise.all(userIds.slice(i, i + USUARIOS_POR_TANDA).map(async (uid) => {
      const [{ data: hist }, { data: pats }] = await Promise.all([
        supabase
          .from('historical_rounds')
          .select(COLS_HISTORIAL)
          .eq('user_id', uid)
          .not('total_gross', 'is', null)
          .order('played_at', { ascending: false })
          .limit(rondasPorUsuario),
        supabase
          .from('player_patterns')
          .select(COLS_PATRONES)
          .eq('user_id', uid)
          .eq('status', 'active')
          .in('pattern_type', [...TIPOS_PATRON_GWI])
          .limit(PATRONES_POR_USUARIO),
      ])
      historialPorUsuario.set(uid, (hist ?? []) as RondaHistoricaGWI[])
      patronesPorUsuario.set(uid, (pats ?? []) as PatronGWIRow[])
    }))
  }
  return { historialPorUsuario, patronesPorUsuario }
}
