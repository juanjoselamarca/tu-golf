// ─── Capa de datos para el metadata/OG de la ronda (server-side) ────────────
// Usada por `ronda-libre/[codigo]/layout.tsx` (generateMetadata). Acepta el
// client de Supabase ya creado (server client en SSR) para no acoplar el layout
// a `supabase.from(...)` directo.
//
// Liviana a propósito: el metadata sólo necesita datos de cancha, jugadores y el
// CONTEO de equipos — no resuelve course handicap (a diferencia de loadRondaLibre),
// para no agregar queries en cada render de SSR.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface RondaMetadataJugador {
  nombre: string
  scores: Record<string, number> | null
  handicap: number | null
}

export interface RondaMetadataLight {
  course_name: string
  course_id: string | null
  estado: string
  holes: number
  formato_juego: string
  modo_juego: string
  recorridos: string[] | null
  ronda_libre_jugadores: RondaMetadataJugador[]
}

export interface RondaMetadataBundle {
  ronda: RondaMetadataLight
  parMap: Record<number, number>
  /** Cantidad de equipos (formatos por equipo). 0 en individuales. */
  teamCount: number
}

const TEAM_FORMATS = ['best_ball', 'scramble', 'foursome']

export async function loadRondaMetadata(
  codigo: string,
  supabase: SupabaseClient,
): Promise<RondaMetadataBundle | null> {
  const { data } = await supabase
    .from('rondas_libres')
    .select('id, course_name, course_id, estado, holes, formato_juego, modo_juego, recorridos, ronda_libre_jugadores(nombre, scores, handicap)')
    .eq('codigo', codigo)
    .single()

  if (!data) return null
  const r = data as unknown as RondaMetadataLight & { id: string }

  // Par por hoyo (sólo si la ronda está ligada a una cancha).
  const parMap: Record<number, number> = {}
  if (r.course_id) {
    let holeQuery = supabase
      .from('course_holes')
      .select('numero, par, recorrido')
      .eq('course_id', r.course_id)
    const recorridos = r.recorridos
    if (recorridos && recorridos.length > 0) {
      holeQuery = holeQuery.in('recorrido', recorridos)
    }
    const { data: holes } = await holeQuery.order('recorrido').order('numero')
    if (holes) {
      const isMultiLoop = !!recorridos && recorridos.length > 1
      let holeNum = 1
      for (const h of holes as Array<{ numero: number; par: number }>) {
        const num = isMultiLoop ? holeNum : h.numero
        parMap[num] = h.par
        holeNum++
      }
    }
  }

  // Conteo de equipos por la FK correcta (ronda_id = id de la ronda, NO el código).
  let teamCount = 0
  if (TEAM_FORMATS.includes(r.formato_juego)) {
    const { count } = await supabase
      .from('ronda_equipos')
      .select('id', { count: 'exact', head: true })
      .eq('ronda_id', r.id)
    teamCount = count ?? 0
  }

  return {
    ronda: {
      course_name: r.course_name,
      course_id: r.course_id,
      estado: r.estado,
      holes: r.holes,
      formato_juego: r.formato_juego,
      modo_juego: r.modo_juego,
      recorridos: r.recorridos,
      ronda_libre_jugadores: r.ronda_libre_jugadores ?? [],
    },
    parMap,
    teamCount,
  }
}
