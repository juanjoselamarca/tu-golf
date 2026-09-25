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

/**
 * Slug único a partir del nombre: kebab-case sin acentos + sufijo temporal
 * base36. Fuente única: lo usan el wizard (`draft/[id]/create-tournament`) y
 * el camino legacy (`api/torneos/create`), que tenían dos copias idénticas.
 */
export function genTournamentSlug(name: string, now: number = Date.now()): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 50) +
    '-' +
    now.toString(36)
  )
}

/** Alfabeto sin 0/O/1/I para que el código se dicte por teléfono sin ambigüedad. */
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_LENGTH = 6

/** Código de inscripción de 6 caracteres, criptográficamente aleatorio. */
export function genTournamentCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length])
    .join('')
}

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
  /**
   * Fecha de la ÚLTIMA ronda. `torneoEnVivo` la usa para saber hasta cuándo
   * el torneo sigue "en vivo": sin ella, un torneo de 3 días dejaba de estar en
   * vivo al terminar el primero. En un torneo de una ronda es `date_start`.
   */
  date_end: string | null
  total_rounds: number
  /** Cupo máximo de jugadores (del wizard). NULL = sin tope. Lo valida joinFlow. */
  max_players: number | null
  /** Descripción libre del torneo (código de vestimenta, premios, etc.). */
  description: string | null
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

/** La fecha más tardía entre las rondas con fecha; null si ninguna la tiene. */
function lastRoundDate(config: Pick<TournamentConfig, 'rounds'>): string | null {
  const fechas = config.rounds.map((r) => r.date).filter((d): d is string => !!d)
  if (fechas.length === 0) return null
  // ISO `YYYY-MM-DD` ordena lexicográficamente igual que cronológicamente.
  return fechas.reduce((max, d) => (d > max ? d : max))
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
    date_end: lastRoundDate(config) ?? config.date_start,
    total_rounds: config.rounds.length,
    // Cupo máximo del wizard: antes se perdía al publicar (nunca se insertaba) y
    // la inscripción no tenía tope. joinFlow lo valida al inscribir.
    max_players: config.registration.max_players ?? null,
    description: config.description ?? null,
  }
}
