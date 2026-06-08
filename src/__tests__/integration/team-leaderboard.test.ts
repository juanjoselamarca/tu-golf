/**
 * Integration — leaderboard de equipos: `fetchScrambleTeams` / `fetchBestBallTeams`
 * mapean correctamente desde `ronda_equipos` contra el SCHEMA REAL de producción.
 *
 * Por qué integration y no mock (CERO FALLOS): estas funciones son el ÚNICO seam
 * sin test del flujo de equipos. Los otros dos están cubiertos por unit tests
 * deterministas:
 *   1. organizador asigna + inicia → ronda_equipos: useTournamentLifecycle.test.ts
 *   2. ronda_equipos → fetch → input del motor: ESTE archivo
 *   3. motor → standings: team-standings.test.ts / best-ball-edge-cases.test.ts
 * Un mock del cliente Supabase probaría un schema inventado; sembrar el grafo real
 * y leerlo con las funciones de producción prueba que la query y el mapeo cuadran
 * con las columnas que existen HOY (atrapa drift de schema).
 *
 * Skipea automáticamente si no hay service-role key (CI sin secrets).
 *
 * Uso:
 *   npx vitest run src/__tests__/integration/team-leaderboard.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  fetchScrambleTeams,
  fetchBestBallTeams,
} from '@/lib/data/tournaments/teamLeaderboard'
import {
  createTeamTournamentFixture,
  type TeamTournamentFixture,
} from '../../../e2e/helpers/tournament-team-fixture'
import { getTestUserId } from '../../../e2e/helpers/ronda-fixture'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const e2eEmail = process.env.E2E_TEST_USER_EMAIL

const skipIfNoEnv = !url || !serviceKey || !e2eEmail

describe.skipIf(skipIfNoEnv)('teamLeaderboard — mapeo desde ronda_equipos (schema real)', () => {
  let admin: SupabaseClient
  let userId: string

  beforeAll(async () => {
    admin = createClient(url!, serviceKey!, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    userId = await getTestUserId()
  }, 30_000)

  describe('fetchScrambleTeams', () => {
    let fx: TeamTournamentFixture

    beforeAll(async () => {
      // Dos equipos con handicap_equipo almacenado + score compartido por hoyo.
      fx = await createTeamTournamentFixture({
        organizerUserId: userId,
        format: 'scramble',
        teams: [
          {
            nombre: 'Águilas',
            handicapEquipo: 6.5,
            sharedScores: { '1': 4, '2': 3, '3': 5 },
            players: [
              { nombre: 'Ana', handicap: 10 },
              { nombre: 'Beto', handicap: 20 },
            ],
          },
          {
            nombre: 'Cóndores',
            handicapEquipo: 8.0,
            sharedScores: { '1': 5, '2': 4 },
            players: [
              { nombre: 'Caro', handicap: 12 },
              { nombre: 'Dani', handicap: 28 },
            ],
          },
        ],
      })
    }, 30_000)

    afterAll(async () => {
      if (fx) await fx.cleanup()
    })

    it('mapea nombre, handicaps, scores y teamHandicap almacenado', async () => {
      const { teams } = await fetchScrambleTeams(admin, fx.tournamentId)

      expect(teams).toHaveLength(2)

      const aguilas = teams.find((t) => t.nombre === 'Águilas')
      expect(aguilas, 'equipo Águilas presente').toBeTruthy()
      // handicaps de guests salen de ronda_libre_jugadores.handicap (sin user_id → sin índice de profile).
      expect(aguilas!.handicaps).toEqual([10, 20])
      // El score compartido del equipo se pasa tal cual al motor.
      expect(aguilas!.scores).toEqual({ '1': 4, '2': 3, '3': 5 })
      // teamHandicap = handicap_equipo almacenado (paridad con la tarjeta en cancha).
      expect(aguilas!.teamHandicap).toBe(6.5)

      const condores = teams.find((t) => t.nombre === 'Cóndores')
      expect(condores!.handicaps).toEqual([12, 28])
      expect(condores!.scores).toEqual({ '1': 5, '2': 4 })
      expect(condores!.teamHandicap).toBe(8.0)
    })

    it('memberNames preserva el orden de membresía (orden ASC)', async () => {
      const { memberNames } = await fetchScrambleTeams(admin, fx.tournamentId)
      const aguilasId = fx.teamIds[0]
      const condoresId = fx.teamIds[1]
      expect(memberNames[aguilasId]).toEqual(['Ana', 'Beto'])
      expect(memberNames[condoresId]).toEqual(['Caro', 'Dani'])
    })

    it('torneo inexistente → resultado vacío, sin throw', async () => {
      const res = await fetchScrambleTeams(
        admin,
        '00000000-0000-0000-0000-000000000000',
      )
      expect(res.teams).toEqual([])
      expect(res.memberNames).toEqual({})
    })
  })

  describe('fetchBestBallTeams', () => {
    let fx: TeamTournamentFixture

    beforeAll(async () => {
      // best_ball: scores INDIVIDUALES por jugador, handicap_equipo null. Course
      // real (Los Leones) para que resuelva el course handicap como el scorer.
      fx = await createTeamTournamentFixture({
        organizerUserId: userId,
        format: 'best_ball',
        holes: 18,
        teams: [
          {
            nombre: 'Halcones',
            handicapEquipo: null,
            players: [
              { nombre: 'Eva', handicap: 8, tees: 'blanco', scores: { '1': 4, '2': 5 } },
              { nombre: 'Fede', handicap: 18, tees: 'blanco', scores: { '1': 6, '2': 4 } },
            ],
          },
        ],
      })
    }, 30_000)

    afterAll(async () => {
      if (fx) await fx.cleanup()
    })

    it('mapea jugadores con scores individuales y course handicap numérico', async () => {
      const parTotal = 72
      const { teams, memberNames } = await fetchBestBallTeams(
        admin,
        fx.tournamentId,
        parTotal,
      )

      expect(teams).toHaveLength(1)
      const halcones = teams[0]
      expect(halcones.nombre).toBe('Halcones')
      expect(halcones.jugadores).toHaveLength(2)

      const eva = halcones.jugadores.find((j) => j.nombre === 'Eva')!
      const fede = halcones.jugadores.find((j) => j.nombre === 'Fede')!

      // Scores individuales mapeados tal cual (best_ball no usa score compartido).
      expect(eva.scores).toEqual({ '1': 4, '2': 5 })
      expect(fede.scores).toEqual({ '1': 6, '2': 4 })

      // handicapIndex acá ES el course handicap (golpes que recibe), no el índice.
      // La exactitud del cálculo está cubierta por course-handicap.test.ts; acá
      // probamos que el mapeo lo resuelve a un número finito (no NaN/undefined).
      expect(Number.isFinite(eva.handicapIndex)).toBe(true)
      expect(Number.isFinite(fede.handicapIndex)).toBe(true)
      // Más golpes de índice ⇒ más course handicap (monotonía del resolver real).
      expect(fede.handicapIndex).toBeGreaterThan(eva.handicapIndex)

      expect(memberNames[fx.teamIds[0]]).toEqual(['Eva', 'Fede'])
    })
  })
})
