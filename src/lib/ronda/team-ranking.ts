import {
  calcularBestBall, ordenarEquiposBestBall,
  calcularScramble, ordenarEquiposScramble,
  calcularFoursome, ordenarEquiposFoursome,
  isTeamFormat, hoyosDelMotor,
} from '@/golf/formats'
import type { ScrambleTeamResult } from '@/golf/formats'
import { hoyosDeLaRonda } from '@/golf/core/hoyos-jugados'
import { scorePrimarioDeEquipo } from '@/golf/leaderboard/team-tiebreak'
import type { FormatoJuego, ModoJuego, Jugador } from '@/types/ronda'

/**
 * Centraliza el cálculo de ranking de equipos para la share card de ronda libre
 * en formatos best_ball / scramble / foursome.
 *
 * Extraído de src/app/ronda-libre/[codigo]/page.tsx (T7 Sprint 1) — eliminaba
 * 2 bloques idénticos (líneas 878-925 y 1793-1840 en el HEAD previo).
 *
 * Bug fix aplicado (Apr-18, memoria 3029):
 *   `isStab` debe depender SOLO del formato, NUNCA de `modo_juego === 'neto'`.
 *   Hacerlo con `||` provocaba que equipos netos se ordenaran por
 *   `totalStableford` (que es 0 en formatos de equipo), rompiendo el ranking.
 */

export interface Equipo {
  id: string
  nombre: string
  /** Handicap COMPLETO del equipo (18h): el que se muestra. */
  handicap_equipo: number | null
  /** Handicap que PUNTÚA, en la escala de los hoyos de la ronda; null = fila anterior (se parte el completo). */
  handicap_equipo_juego: number | null
  jugadorIds: string[]
  scores: Record<string, number>
}

export type JugadorRanking = Pick<Jugador, 'id' | 'nombre' | 'scores'> & { handicap?: number | null }

export interface RankTeamsInput {
  equipos: Equipo[]
  jugadores: JugadorRanking[]
  parMap: Record<number, number>
  siMap: Record<number, number>
  /** Course handicap RESUELTO al nº de hoyos (9h cuando 9h) por jugador. Best ball
   *  lo usa para no repartir el índice crudo — paridad con el board y el scorer. */
  courseHcpMap: Record<string, number>
  holes: number
  /** Hoyo de salida (`ronda.hoyo_inicio`): una ronda de 9 desde el 10 juega los hoyos 10-18. */
  hoyoInicio?: number | null
  formato: FormatoJuego
  modo: ModoJuego
}

export interface TeamShareRow {
  nombre: string
  jugadores: string[]
  score: number
  /** Score primario del equipo (`scorePrimarioDeEquipo`): vs par gross o neto según el modo. */
  diff: number
  /** Hoyos con score del equipo. 0 = no anotó nada: va al final y no compite. */
  holesPlayed: number
}

/** Lo que los tres motores de equipo tienen en común y este ranking necesita. */
type ResultadoDeEquipo = Pick<ScrambleTeamResult,
  'teamId' | 'teamNombre' | 'totalGross' | 'totalNeto' | 'totalStableford' | 'overUnderGross' | 'overUnderNeto' | 'holesPlayed'>

export function rankTeams(input: RankTeamsInput): TeamShareRow[] {
  const { equipos, jugadores, parMap, siMap, courseHcpMap, holes, hoyoInicio, formato, modo } = input

  if (!isTeamFormat(formato)) return []
  if (equipos.length === 0 || Object.keys(parMap).length === 0) return []

  const holeData = hoyosDelMotor(hoyosDeLaRonda(hoyoInicio, holes), h => parMap[h], h => siMap[h])
  const parTotal = holeData.reduce((s, h) => s + h.par, 0)

  // El MISMO orden que la tabla de equipos (`TeamLeaderboards`, `team-standings`):
  // vs par según el modo, countback USGA en los empates y los equipos sin hoyos al
  // final. Antes ordenaba por golpes brutos en gross: con distinta cantidad de hoyos
  // anotados, el cuadro ganador y la tabla de abajo nombraban a distinto primero
  // (revisión del PR #757, 09-nov-2026).
  const sorted: ResultadoDeEquipo[] = formato === 'best_ball'
    ? ordenarEquiposBestBall(equipos.map(eq => {
        const players = eq.jugadorIds.map(jid => {
          const j = jugadores.find(jj => jj.id === jid)
          return j ? { id: j.id, nombre: j.nombre, handicapIndex: courseHcpMap[j.id] ?? Math.round(j.handicap ?? 0), scores: j.scores || {} } : null
        }).filter(Boolean) as Array<{ id: string; nombre: string; handicapIndex: number; scores: Record<string, number> }>
        return calcularBestBall({ id: eq.id, nombre: eq.nombre, jugadores: players }, holeData, parTotal)
      }), formato, modo)
    : formato === 'scramble'
      // Handicap de equipo ALMACENADO: el mismo que juega el scorer y el board (#602).
      ? ordenarEquiposScramble(equipos.map(eq =>
          calcularScramble({ id: eq.id, nombre: eq.nombre, scores: eq.scores, teamHandicap: eq.handicap_equipo, teamHandicapJuego: eq.handicap_equipo_juego }, holeData, parTotal),
        ), formato, modo)
      : ordenarEquiposFoursome(equipos.map(eq => {
          const members = eq.jugadorIds.map(jid => {
            const j = jugadores.find(jj => jj.id === jid)
            return { nombre: j?.nombre ?? '' }
          })
          return calcularFoursome({
            id: eq.id, nombre: eq.nombre,
            nombreA: members[0]?.nombre ?? '', nombreB: members[1]?.nombre ?? '',
            scores: eq.scores,
            teamHandicap: eq.handicap_equipo,
            teamHandicapJuego: eq.handicap_equipo_juego,
          }, holeData, parTotal)
        }), formato, modo)

  // Bug fix Apr-18: isStab SOLO por formato (nunca por modo_juego).
  // stableford no es formato de equipo según la guarda inicial (línea ~47),
  // por lo que este flag será siempre false en práctica — se mantiene para
  // simetría estructural con el ranking individual y defensa en profundidad.
  const isStab: boolean = formato === 'stableford'
  const isNeto = modo === 'neto'

  return sorted.map(r => ({
    nombre: r.teamNombre,
    jugadores: equipos.find(e => e.id === r.teamId)?.jugadorIds
      .map(jid => jugadores.find(j => j.id === jid)?.nombre || '').filter(Boolean) || [],
    score: isStab ? r.totalStableford : isNeto ? r.totalNeto : r.totalGross,
    // El mismo score primario con que la tabla de equipos da el lugar (`scorePrimarioDeEquipo`):
    // imagen, cuadro ganador y tabla comparan lo mismo.
    diff: scorePrimarioDeEquipo(r, formato, modo),
    holesPlayed: r.holesPlayed,
  }))
}
