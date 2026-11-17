// src/lib/data/tournaments/equipos-del-board.ts
//
// La tabla de EQUIPOS de un torneo (scramble, foursome, mejor bola), armada en UN
// lugar para /torneo/[slug] y /en-vivo (y sus rutas cacheables). Antes cada
// pantalla repetía la cadena fetch → motor → mapeo, y la regla de WD/DQ de
// equipos (#813) habría quedado copiada dos veces.
//
// WD/DQ (decisiones de Juanjo, 17-nov):
//  - Foursome: el equipo con un miembro WD/DQ va al pie (Regla 22).
//  - Scramble: el equipo sigue; el miembro va marcado "· WD"/"· DQ".
//  - Mejor bola: el equipo sigue con el miembro marcado; los golpes del DQ no
//    cuentan, y si un hoyo anotado queda sin compañero válido, el equipo va al pie
//    como DQ (Reglas 3.3c / 23.2b).

import type { SupabaseClient } from '@supabase/supabase-js'
import { isSharedBallFormat } from '@/golf/formats'
import type { WithdrawnEntry } from '@/app/torneo/[slug]/types'
import type { LiveTeam } from '@/app/torneo/[slug]/en-vivo/types'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'
import type { CourseHole } from '@/golf/leaderboard/types'
import type { LeerIndicesDePerfil } from '@/lib/data/indices-de-perfil-lectura'
import type { TeamStandingForPodium } from '@/golf/leaderboard/compute-tournament-results'
import { computeBestBallStandings, computeFoursomeStandings, computeScrambleStandings } from '@/golf/leaderboard/team-standings'
import { bestBallResultsToLiveTeams, scrambleResultsToLiveTeams } from '@/app/torneo/[slug]/en-vivo/scrambleTeamsToLive'
import { fetchBestBallTeams, fetchScrambleTeams, type EstadoPorTarjeta } from './teamLeaderboard'
import { separarEquiposFuera } from './fuera-del-ranking'

export interface EquiposDelBoard {
  /** Equipos que compiten, ya ordenados (podio y resultados del cierre). */
  ordenados: TeamStandingForPodium[]
  /** Lo mismo, como filas de la tabla. */
  live: LiveTeam[]
  /** Nombres por equipo (con la marca del WD/DQ), para el podio y los resultados. */
  memberNames: Record<string, string[]>
  /** El pie de la tabla de equipos (equipos WD/DQ). */
  fuera: WithdrawnEntry[]
}

/**
 * `null` si el torneo no es de equipos o todavía no hay equipos armados (la
 * pantalla cae a la tabla individual). Los errores de la base se LANZAN: cada
 * pantalla decide cómo degradar.
 */
export async function armarEquiposDelBoard(
  supabase: SupabaseClient,
  args: {
    tournamentId: string
    /** Formato REAL del torneo (decide la regla de equipos). */
    formatoReal: string | null
    /** Formato y modo con los que se calcula y ordena (los de la vista). */
    formato: FormatoJuego
    modo: ModoJuego
    courseHoles: CourseHole[]
    parTotal: number
    totalHoyos: number
    leerIndices: LeerIndicesDePerfil
    porTarjeta: EstadoPorTarjeta
  },
): Promise<EquiposDelBoard | null> {
  const { formato, modo, courseHoles, parTotal, totalHoyos } = args
  const modoLive = modo as 'gross' | 'neto'
  if (isSharedBallFormat(args.formatoReal)) {
    const { teams, memberNames, estadoPorEquipo } = await fetchScrambleTeams(supabase, args.tournamentId, args.porTarjeta)
    if (teams.length === 0) return null
    const equipos = args.formatoReal === 'foursome'
      ? separarEquiposFuera(computeFoursomeStandings(teams, memberNames, courseHoles, parTotal, formato, modo, totalHoyos), estadoPorEquipo, modoLive)
      : { enRanking: computeScrambleStandings(teams, courseHoles, parTotal, formato, modo, totalHoyos), fuera: [] }
    return { ordenados: equipos.enRanking, live: scrambleResultsToLiveTeams(equipos.enRanking, memberNames, modoLive), memberNames, fuera: equipos.fuera }
  }
  if (args.formatoReal === 'best_ball') {
    const { teams, memberNames, estadoPorEquipo } = await fetchBestBallTeams(supabase, args.tournamentId, parTotal, args.leerIndices, args.porTarjeta)
    if (teams.length === 0) return null
    const equipos = separarEquiposFuera(computeBestBallStandings(teams, courseHoles, parTotal, formato, modo, totalHoyos), estadoPorEquipo, modoLive)
    return { ordenados: equipos.enRanking, live: bestBallResultsToLiveTeams(equipos.enRanking, memberNames, modoLive), memberNames, fuera: equipos.fuera }
  }
  return null
}
