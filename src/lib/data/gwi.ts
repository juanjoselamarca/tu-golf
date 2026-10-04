// ─── Capa de datos — GWI (servidor) ─────────────────────────────────────────
// Historial y patrones del coach de los jugadores: los inputs PRIVADOS del GWI.
// Sólo lo usan `gwi-ronda-libre.ts` y `gwi-torneo.ts`, que calculan el GWI en el
// servidor y devuelven el resultado público (`GWIResponse`). Nunca se exponen.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { PatronGWIRow, RondaHistoricaGWI } from '@/golf/stats/gwi-historial'

export interface DatosPrivadosGWI {
  historialPorUsuario: Map<string, RondaHistoricaGWI[]>
  patronesPorUsuario: Map<string, PatronGWIRow[]>
}

/** Los únicos tipos de patrón que el GWI modela (`patronesGWI`). */
const TIPOS_PATRON_GWI = ['back_nine_collapse', 'post_bogey_spiral'] as const
/** Usuarios consultados en paralelo por tanda (un torneo puede tener 100+). */
const USUARIOS_POR_TANDA = 8

/**
 * Historial (más reciente primero, a lo más `rondasPorUsuario`) y patrones
 * activos de cada usuario. Una query POR USUARIO con límite explícito: la query
 * batch de antes (`.in(user_id)` sin límite) chocaba con el tope silencioso de
 * 1.000 filas de PostgREST y, ordenada por fecha, podía dejar sin historial a
 * los jugadores con rondas más antiguas. Sin usuarios no consulta nada.
 */
export async function fetchDatosPrivadosGWI(
  supabase: Pick<SupabaseClient, 'from'>,
  userIds: string[],
  rondasPorUsuario: number,
): Promise<DatosPrivadosGWI> {
  const historialPorUsuario = new Map<string, RondaHistoricaGWI[]>()
  const patronesPorUsuario = new Map<string, PatronGWIRow[]>()
  const unicos = Array.from(new Set(userIds))

  for (let i = 0; i < unicos.length; i += USUARIOS_POR_TANDA) {
    await Promise.all(unicos.slice(i, i + USUARIOS_POR_TANDA).map(async (uid) => {
      const [{ data: hist }, { data: pats }] = await Promise.all([
        supabase
          .from('historical_rounds')
          .select('total_gross, course_name, holes_played, scores')
          .eq('user_id', uid)
          .not('total_gross', 'is', null)
          .order('played_at', { ascending: false })
          .limit(rondasPorUsuario),
        supabase
          .from('player_patterns')
          .select('pattern_type, confidence, metadata')
          .eq('user_id', uid)
          .eq('status', 'active')
          .in('pattern_type', [...TIPOS_PATRON_GWI])
          .limit(50),
      ])
      historialPorUsuario.set(uid, (hist ?? []) as RondaHistoricaGWI[])
      patronesPorUsuario.set(uid, (pats ?? []) as PatronGWIRow[])
    }))
  }

  return { historialPorUsuario, patronesPorUsuario }
}
