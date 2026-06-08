import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * Fixture de "torneo de equipos" para integration/E2E tests con writes.
 *
 * Siembra el grafo REAL que produce el flujo organizador al iniciar un torneo
 * por equipos (modelo PM 2026-06-02 "el grupo de salida ES el equipo"):
 *
 *   tournaments
 *     └─ tournament_groups (1 por equipo, con ronda_libre_id)
 *          └─ rondas_libres (1 por grupo, formato_juego = scramble|best_ball|foursome)
 *               ├─ ronda_libre_jugadores (miembros)
 *               └─ ronda_equipos (nombre + handicap_equipo + scores compartidos)
 *                    └─ ronda_equipo_jugadores (membresía, orden preservado)
 *
 * Esto es exactamente lo que lee `fetchScrambleTeams` / `fetchBestBallTeams`
 * (src/lib/data/tournaments/teamLeaderboard.ts) para armar el leaderboard. Un
 * test que siembra acá y llama esas funciones prueba el seam DB→fetch contra el
 * SCHEMA REAL de producción — sin mocks que puedan divergir.
 *
 * Safety:
 * - Solo con service_role key (admin, bypassa RLS). Nunca en frontend.
 * - Cada test DEBE llamar `cleanup()` en afterAll, aún si el test falla.
 * - Los nombres llevan prefijo "E2E" para identificación/limpieza manual.
 */

// Los Leones — course validado en prod con course_holes + course_tees poblados
// (mismo default que ronda-fixture.ts). Necesario para el course handicap de
// best_ball; scramble/foursome no lo usan.
const DEFAULT_COURSE_ID = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'
const DEFAULT_COURSE_NAME = 'Los Leones'

function adminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

function randomSuffix(): string {
  const alphabet = 'acdefghjkmnpqrstvwxyz2345679'
  let s = ''
  for (let i = 0; i < 8; i++) s += alphabet[Math.floor(Math.random() * alphabet.length)]
  return s
}

export interface TeamPlayerSpec {
  nombre: string
  /** Handicap almacenado en la ronda (snapshot al iniciar). Precede a profiles.indice. */
  handicap?: number | null
  /** Tee del jugador (para course handicap en best_ball). Default 'blanco'. */
  tees?: string
  /** Scores individuales por hoyo, ej {"1":4,"2":5}. Solo best_ball los usa. */
  scores?: Record<string, number>
}

export interface TeamSpec {
  nombre: string
  /** ronda_equipos.handicap_equipo (USGA canónico). null en best_ball. */
  handicapEquipo?: number | null
  /** Score compartido por hoyo del equipo (scramble/foursome). */
  sharedScores?: Record<string, number>
  players: TeamPlayerSpec[]
}

export interface CreateTeamTournamentOpts {
  organizerUserId: string
  format: 'scramble' | 'best_ball' | 'foursome'
  teams: TeamSpec[]
  /** Default Los Leones. best_ball necesita un course con holes/tees reales. */
  courseId?: string
  courseName?: string
  holes?: 9 | 18
}

export interface TeamTournamentFixture {
  tournamentId: string
  slug: string
  rondaIds: string[]
  /** ronda_equipos ids, en el orden de `opts.teams`. */
  teamIds: string[]
  teamNames: string[]
  /** Borra TODO el grafo en orden FK-safe. Idempotente. */
  cleanup: () => Promise<void>
}

/**
 * Siembra un torneo de equipos completo y devuelve los ids + un cleanup.
 * Un `rondas_libres` por equipo (igual que la materialización real, que crea
 * una ronda por grupo).
 */
export async function createTeamTournamentFixture(
  opts: CreateTeamTournamentOpts,
): Promise<TeamTournamentFixture> {
  const admin = adminClient()
  const courseId = opts.courseId ?? DEFAULT_COURSE_ID
  const courseName = opts.courseName ?? DEFAULT_COURSE_NAME
  const holes = opts.holes ?? 18
  const fecha = new Date().toISOString().slice(0, 10)
  const slug = `e2e-equipos-${randomSuffix()}`

  const rondaIds: string[] = []
  const teamIds: string[] = []
  const teamNames: string[] = []

  // Cleanup parcial reutilizable si algo falla a mitad de camino.
  let tournamentId = ''
  const cleanup = async () => {
    const a = adminClient()
    const errs: string[] = []
    // Acumula errores en vez de tragarlos: un delete que falla (RLS, red) no debe
    // pasar inadvertido — corrida tras corrida acumularía huérfanos en prod.
    const del = async (
      label: string,
      builder: PromiseLike<{ error: { message: string } | null }>,
    ) => {
      const { error } = await builder
      if (error) errs.push(`${label}: ${error.message}`)
    }
    // Hijos antes que padres (FK). `tournament_groups.ronda_libre_id` es RESTRICT,
    // así que el grupo se borra ANTES que su ronda.
    if (teamIds.length) await del('ronda_equipo_jugadores', a.from('ronda_equipo_jugadores').delete().in('equipo_id', teamIds))
    if (rondaIds.length) {
      await del('ronda_equipos', a.from('ronda_equipos').delete().in('ronda_id', rondaIds))
      await del('ronda_libre_jugadores', a.from('ronda_libre_jugadores').delete().in('ronda_id', rondaIds))
    }
    if (tournamentId) await del('tournament_groups', a.from('tournament_groups').delete().eq('tournament_id', tournamentId))
    if (rondaIds.length) await del('rondas_libres', a.from('rondas_libres').delete().in('id', rondaIds))
    if (tournamentId) await del('tournaments', a.from('tournaments').delete().eq('id', tournamentId))
    if (errs.length) {
      // No `throw`: en afterAll enmascararía el resultado real del test. Visible
      // para que un cleanup parcial no acumule basura silenciosa en prod.
      console.warn(
        `[tournament-team-fixture] cleanup parcial — huérfanos posibles:\n  ${errs.join('\n  ')}`,
      )
    }
  }

  try {
    // 1) Torneo.
    const { data: t, error: tErr } = await admin
      .from('tournaments')
      .insert({
        name: `E2E Equipos ${opts.format}`,
        slug,
        organizer_id: opts.organizerUserId,
        course_name: courseName,
        date_start: fecha,
        format: opts.format,
        hole_count: holes,
        status: 'in_progress',
      })
      .select('id, slug')
      .single()
    if (tErr || !t) throw new Error(`insert tournaments falló: ${tErr?.message ?? 'unknown'}`)
    tournamentId = t.id as string

    // 2) Por equipo: ronda + grupo + jugadores + equipo + membresía.
    for (let ti = 0; ti < opts.teams.length; ti++) {
      const team = opts.teams[ti]

      const { data: ronda, error: rErr } = await admin
        .from('rondas_libres')
        .insert({
          codigo: randomSuffix().slice(0, 6).toUpperCase(),
          course_id: courseId,
          course_name: courseName,
          tees: 'blanco',
          holes,
          fecha,
          hoyo_inicio: 1,
          formato_juego: opts.format,
          modo_juego: 'neto',
          admin_mode: false,
          estado: 'en_curso',
          creador_id: opts.organizerUserId,
        })
        .select('id')
        .single()
      if (rErr || !ronda) throw new Error(`insert rondas_libres falló: ${rErr?.message ?? 'unknown'}`)
      const rondaId = ronda.id as string
      rondaIds.push(rondaId)

      const { error: gErr } = await admin.from('tournament_groups').insert({
        tournament_id: tournamentId,
        name: team.nombre,
        ronda_libre_id: rondaId,
        sort_order: ti,
      })
      if (gErr) throw new Error(`insert tournament_groups falló: ${gErr.message}`)

      // Jugadores de la ronda (guests: sin user_id, handicap explícito).
      const playerIds: string[] = []
      for (const p of team.players) {
        const { data: rlj, error: pErr } = await admin
          .from('ronda_libre_jugadores')
          .insert({
            ronda_id: rondaId,
            user_id: null,
            nombre: p.nombre,
            handicap: p.handicap ?? null,
            tees: p.tees ?? 'blanco',
            scores: p.scores ?? {},
            is_guest: true,
          })
          .select('id')
          .single()
        if (pErr || !rlj) throw new Error(`insert ronda_libre_jugadores falló: ${pErr?.message ?? 'unknown'}`)
        playerIds.push(rlj.id as string)
      }

      const { data: equipo, error: eErr } = await admin
        .from('ronda_equipos')
        .insert({
          ronda_id: rondaId,
          nombre: team.nombre,
          handicap_equipo: team.handicapEquipo ?? null,
          scores: team.sharedScores ?? {},
        })
        .select('id')
        .single()
      if (eErr || !equipo) throw new Error(`insert ronda_equipos falló: ${eErr?.message ?? 'unknown'}`)
      const equipoId = equipo.id as string
      teamIds.push(equipoId)
      teamNames.push(team.nombre)

      const memberRows = playerIds.map((jid, idx) => ({
        equipo_id: equipoId,
        jugador_id: jid,
        orden: idx,
      }))
      const { error: mErr } = await admin.from('ronda_equipo_jugadores').insert(memberRows)
      if (mErr) throw new Error(`insert ronda_equipo_jugadores falló: ${mErr.message}`)
    }

    return { tournamentId, slug, rondaIds, teamIds, teamNames, cleanup }
  } catch (err) {
    // Si falla a mitad, no dejar basura en prod.
    await cleanup().catch(() => {})
    throw err
  }
}
