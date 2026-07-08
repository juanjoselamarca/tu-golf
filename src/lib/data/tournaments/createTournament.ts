// src/lib/data/tournaments/createTournament.ts
//
// Mapeo de `TournamentConfig` (wizard/draft) → fila para insertar en
// `tournaments`. Vive en lib/data porque es el contrato entre la app y la
// tabla — testeable sin depender del route handler.
//
// Punto crítico (P0 auditoría FTUE 22-may): `team_config` viajaba en el draft
// pero se perdía al publicar porque el insert nunca lo leía. Centralizar el
// mapeo acá garantiza que el contrato quede cubierto por test y no se vuelva
// a romper en silencio.

import type { TeamConfig, TournamentConfig } from '@/lib/draft/types'

/** Valor de `tournaments.tees` derivado del modo de asignación de la ronda. */
export type TeesMode = 'per_player' | 'manual' | 'mixed'

export interface TournamentInsertRow {
  name: string
  slug: string
  organizer_id: string
  course_id: string | null
  format: TournamentConfig['format']
  formato_juego: TournamentConfig['format']
  modo_juego: TournamentConfig['modo']
  team_config: TeamConfig | null
  hole_count: 9 | 18
  tees: TeesMode
  use_handicap: boolean
  afecta_estadisticas: boolean
  codigo: string
  cover_image_url: string | null
  status: 'draft'
  date_start: string | null
  total_rounds: number
  /** Cupo máximo de jugadores (del wizard). NULL = sin tope. Lo valida joinFlow. */
  max_players: number | null
}

export interface MapTournamentMeta {
  organizerId: string
  slug: string
  code: string
}

/** `tournaments.tees` distingue per_player / manual; el resto cae a 'mixed'. */
function teesFromAssignmentMode(
  mode: TournamentConfig['rounds'][number]['tee_assignment_mode'],
): TeesMode {
  if (mode === 'per_player') return 'per_player'
  if (mode === 'manual') return 'manual'
  return 'mixed'
}

/**
 * Construye la fila `tournaments` a insertar al publicar un draft.
 * `team_config` se persiste para que la página del organizador sepa que el
 * torneo es de equipos y con qué tamaño/formación renderizar la asignación.
 * NULL para torneos individuales.
 */
export function mapTournamentForInsert(
  config: TournamentConfig,
  meta: MapTournamentMeta,
): TournamentInsertRow {
  const firstRound = config.rounds[0]
  return {
    name: config.name,
    slug: meta.slug,
    organizer_id: meta.organizerId,
    course_id: firstRound.course_id,
    format: config.format,
    formato_juego: config.format,
    modo_juego: config.modo,
    team_config: config.team_config ?? null,
    hole_count: firstRound.hole_count,
    tees: teesFromAssignmentMode(firstRound.tee_assignment_mode),
    use_handicap: config.use_handicap,
    afecta_estadisticas: !config.is_practice,
    codigo: meta.code,
    cover_image_url: config.cover_image_url,
    status: 'draft',
    date_start: config.date_start,
    total_rounds: config.rounds.length,
    // Cupo máximo del wizard: antes se perdía al publicar (nunca se insertaba) y
    // la inscripción no tenía tope. joinFlow lo valida al inscribir.
    max_players: config.registration.max_players ?? null,
  }
}
