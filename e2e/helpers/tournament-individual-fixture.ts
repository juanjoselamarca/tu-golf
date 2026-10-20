import { adminClient, DEFAULT_COURSE_ID, sinError, sufijo } from './ronda-fixture'

export interface IndividualPlayerSpec {
  nombre: string
  /** null en un jugador con cuenta: el índice sale de su perfil. */
  handicap: number | null
  /** Golpes por hoyo, ej {"1":4,"2":5}. */
  scores: Record<string, number>
  /** Jugador con cuenta; sin esto, invitado. */
  userId?: string
}

export interface CreateIndividualTournamentOpts {
  organizerUserId: string
  name: string
  status: 'draft' | 'in_progress' | 'closed'
  /** Default 'neto'. */
  modo?: 'gross' | 'neto'
  esDemo?: boolean
  /** Default 1. */
  totalRounds?: number
  players: IndividualPlayerSpec[]
}

/**
 * Torneo stroke play en Los Leones con el grafo que produce el organizador al iniciarlo: un tournament_group por
 * grupo de salida (hasta 4 invitados), cada uno jugando en su ronda libre. Devuelve el slug. Todo cuelga del
 * organizador: `deleteEphemeralUser(organizerUserId)` lo borra.
 */
export async function createIndividualTournamentFixture(opts: CreateIndividualTournamentOpts): Promise<string> {
  const sb = adminClient()
  const slug = `e2e-torneo-${sufijo()}`
  const fecha = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' })
  const t = await sinError('insert tournaments', sb.from('tournaments').insert({
    name: opts.name,
    slug,
    organizer_id: opts.organizerUserId,
    course_id: DEFAULT_COURSE_ID,
    course_name: 'Los Leones',
    date_start: fecha,
    format: 'stroke_play',
    formato_juego: 'stroke_play',
    modo_juego: opts.modo ?? 'neto',
    hole_count: 18,
    status: opts.status,
    total_rounds: opts.totalRounds ?? 1,
    es_demo: opts.esDemo ?? false,
  }).select('id').single()) as { id: string }

  for (let g = 0; g * 4 < opts.players.length; g++) {
    const r = await sinError('insert rondas_libres', sb.from('rondas_libres').insert({
      codigo: sufijo().slice(0, 6).toUpperCase(),
      course_id: DEFAULT_COURSE_ID,
      course_name: 'Los Leones',
      tees: 'blanco',
      holes: 18,
      fecha,
      hoyo_inicio: 1,
      formato_juego: 'stroke_play',
      modo_juego: opts.modo ?? 'neto',
      admin_mode: false,
      estado: opts.status === 'closed' ? 'finalizada' : 'en_curso',
      creador_id: opts.organizerUserId,
    }).select('id').single()) as { id: string }
    await sinError('insert ronda_libre_jugadores', sb.from('ronda_libre_jugadores').insert(
      opts.players.slice(g * 4, g * 4 + 4).map(p => ({
        ronda_id: r.id, user_id: p.userId ?? null, nombre: p.nombre, handicap: p.handicap, tees: 'blanco', scores: p.scores, is_guest: !p.userId,
      })),
    ).select('id'))
    await sinError('insert tournament_groups', sb.from('tournament_groups').insert({
      tournament_id: t.id, name: `Grupo ${g + 1}`, ronda_libre_id: r.id, sort_order: g,
    }).select('id'))
  }
  return slug
}

/** Tarjeta de `hoyos` hoyos con `golpes` en cada uno, y `extra` golpes de más repartidos desde el hoyo 1. */
export function tarjeta(hoyos: number, golpes: number, extra = 0): Record<string, number> {
  return Object.fromEntries(Array.from({ length: hoyos }, (_, i) => [String(i + 1), golpes + (i < extra ? 1 : 0)]))
}
