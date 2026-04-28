// ─── Ronda Types ──────────────────────────────────────────────────────────
// Tipos compartidos entre las páginas de ronda-libre.
// Lift-and-shift desde inline declarations; UNION superset — todos los
// campos existentes en cualquier call site están presentes aquí, marcados
// como opcionales si no existían en todos los lugares.
//
// NO MODIFICAR la forma de los tipos sin verificar los call sites:
//   - src/app/ronda-libre/[codigo]/page.tsx
//   - src/app/ronda-libre/[codigo]/score/page.tsx
//   - src/app/ronda-libre/[codigo]/score-grupo/page.tsx

import type { ModoJuego, FormatoJuego } from '@/golf/core/rules'

export type { ModoJuego, FormatoJuego }

/** Jugador dentro de una ronda libre (union superset). */
export interface Jugador {
  id: string
  nombre: string
  user_id: string | null
  scores: Record<string, number>
  handicap?: number | null
  tees?: string | null
}

/** Hoyo de la cancha (usado en [codigo]/page.tsx). */
export interface CourseHole {
  numero: number
  par: number
  stroke_index: number
}

/** Datos del hoyo en score/score-grupo (incluye yardaje). */
export interface HoleData {
  numero: number
  par: number
  stroke_index: number
  /** Yardaje legacy — fallback cuando no hay yardajes por tee. */
  yardaje: number | null
  /** Yardajes por color de tee — permite que cada jugador vea la distancia de SU tee en canchas multi-loop. */
  yardajes?: {
    negras?: number | null
    azul?: number | null
    blanco?: number | null
    rojo?: number | null
  }
}

/**
 * Selecciona el yardaje correcto según el tee del jugador.
 * Devuelve solo el yardaje del tee del jugador. Sin fallback a otros tees:
 * mostrar el yardaje de varones a una jugadora desde rojo es información errónea.
 */
export function getYardajeForTee(hole: HoleData | undefined | null, tee: string | null | undefined): number | null {
  if (!hole) return null
  if (!hole.yardajes) return null
  const t = (tee || '').toLowerCase()
  let key: keyof NonNullable<HoleData['yardajes']> | null = null
  // Aliases defensivos para datos externos / snapshots viejos.
  if (t === 'negras' || t === 'black' || t === 'campeonato' || t === 'negro') key = 'negras'
  else if (t === 'blue' || t === 'azul') key = 'azul'
  else if (t === 'white' || t === 'blanco') key = 'blanco'
  else if (t === 'red' || t === 'rojo') key = 'rojo'
  return key ? (hole.yardajes[key] ?? null) : null
}

/** Ronda libre (union superset entre [codigo], score y score-grupo). */
export interface RondaLibre {
  id:                    string
  codigo:                string
  course_name:           string
  course_id:             string | null
  tees:                  string
  holes:                 number
  fecha:                 string
  estado:                string
  modo_juego:            ModoJuego
  formato_juego:         FormatoJuego
  hoyo_inicio?:          number | null
  admin_mode?:           boolean
  admin_user_id?:        string
  es_demo?:              boolean
  creador_id?:           string
  recorridos?:           string[] | null
  ronda_libre_jugadores: Jugador[]
}

/** Rol del usuario en la vista live ([codigo]/page.tsx). */
export type Role = 'espectador' | null

/** Evento del timeline en la vista live ([codigo]/page.tsx). */
export type TimelineEvent = {
  jugador: string
  hole: number
  score: number
  diff: number
  timestamp?: number // epoch ms approximation for relative time
}
