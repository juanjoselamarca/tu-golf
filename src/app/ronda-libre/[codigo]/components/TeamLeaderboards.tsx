// Ranking de equipos (best_ball / scramble / foursome). Consolida los 3 bloques
// casi-duplicados del monolito en un componente con switch por formato. Verbatim
// en la construcción de cada formato.
import TeamLeaderboard from '@/components/TeamLeaderboard'
import {
  calcularBestBall, ordenarEquiposBestBall,
  calcularScramble, ordenarEquiposScramble,
  calcularFoursome, ordenarEquiposFoursome,
} from '@/golf/formats'
import type { BestBallPlayer, ScrambleTeam, FoursomeTeam } from '@/golf/formats'
import type { RondaLibre } from '@/types/ronda'
import type { Equipo } from '@/app/ronda-libre/[codigo]/types'

export interface TeamLeaderboardsProps {
  ronda: RondaLibre
  equipos: Equipo[]
  parMap: Record<number, number>
  siMap: Record<number, number>
}

export function TeamLeaderboards({ ronda, equipos, parMap, siMap }: TeamLeaderboardsProps) {
  if (equipos.length === 0 || Object.keys(parMap).length === 0) return null

  const holeData = Array.from({ length: ronda.holes }, (_, i) => ({
    numero: i + 1,
    par: parMap[i + 1] ?? 4,
    stroke_index: siMap[i + 1] ?? (i + 1),
  }))
  const parTotal = holeData.reduce((s, h) => s + h.par, 0)

  const nombresDe = (teamId: string) =>
    equipos.find(e => e.id === teamId)?.jugadorIds
      .map(jid => ronda.ronda_libre_jugadores.find(j => j.id === jid)?.nombre || '')
      .filter(Boolean) || []

  if (ronda.formato_juego === 'best_ball') {
    const teams = equipos.map(eq => ({
      id: eq.id,
      nombre: eq.nombre,
      jugadores: eq.jugadorIds
        .map(jid => {
          const j = ronda.ronda_libre_jugadores.find(jj => jj.id === jid)
          if (!j) return null
          return {
            id: j.id,
            nombre: j.nombre,
            handicapIndex: j.handicap ?? 0,
            scores: j.scores || {},
          } as BestBallPlayer
        })
        .filter(Boolean) as BestBallPlayer[],
    }))
    const results = teams.map(t => calcularBestBall(t, holeData, parTotal))
    const sorted = ordenarEquiposBestBall(results, ronda.formato_juego, ronda.modo_juego)
    return (
      <TeamLeaderboard
        teams={sorted.map(r => ({
          teamId: r.teamId,
          teamNombre: r.teamNombre,
          totalGross: r.totalGross,
          totalNeto: r.totalNeto,
          totalStableford: r.totalStableford,
          overUnderGross: r.overUnderGross,
          overUnderNeto: r.overUnderNeto,
          holesPlayed: r.holesPlayed,
          jugadores: nombresDe(r.teamId),
        }))}
        modoJuego={ronda.modo_juego}
        formatoJuego={ronda.formato_juego}
        totalHoles={ronda.holes}
        formato="best_ball"
      />
    )
  }

  if (ronda.formato_juego === 'scramble') {
    const teams: ScrambleTeam[] = equipos.map(eq => ({
      id: eq.id,
      nombre: eq.nombre,
      handicaps: eq.jugadorIds.map(jid => {
        const j = ronda.ronda_libre_jugadores.find(jj => jj.id === jid)
        return j?.handicap ?? 0
      }),
      scores: eq.scores,
    }))
    const results = teams.map(t => calcularScramble(t, holeData, parTotal))
    const sorted = ordenarEquiposScramble(results, ronda.formato_juego, ronda.modo_juego)
    return (
      <TeamLeaderboard
        teams={sorted.map(r => ({
          teamId: r.teamId,
          teamNombre: r.teamNombre,
          totalGross: r.totalGross,
          totalNeto: r.totalNeto,
          totalStableford: r.totalStableford,
          overUnderGross: r.overUnderGross,
          overUnderNeto: r.overUnderNeto,
          holesPlayed: r.holesPlayed,
          jugadores: nombresDe(r.teamId),
          teamHandicap: r.teamHandicap,
        }))}
        modoJuego={ronda.modo_juego}
        formatoJuego={ronda.formato_juego}
        totalHoles={ronda.holes}
        formato="scramble"
      />
    )
  }

  if (ronda.formato_juego === 'foursome') {
    const teams: FoursomeTeam[] = equipos.map(eq => {
      const members = eq.jugadorIds.map(jid => ronda.ronda_libre_jugadores.find(j => j.id === jid))
      return {
        id: eq.id,
        nombre: eq.nombre,
        handicapA: members[0]?.handicap ?? 0,
        handicapB: members[1]?.handicap ?? 0,
        nombreA: members[0]?.nombre ?? '?',
        nombreB: members[1]?.nombre ?? '?',
        scores: eq.scores,
      }
    })
    const results = teams.map(t => calcularFoursome(t, holeData, parTotal))
    const sorted = ordenarEquiposFoursome(results, ronda.formato_juego, ronda.modo_juego)
    return (
      <TeamLeaderboard
        teams={sorted.map(r => ({
          teamId: r.teamId,
          teamNombre: r.teamNombre,
          totalGross: r.totalGross,
          totalNeto: r.totalNeto,
          totalStableford: r.totalStableford,
          overUnderGross: r.overUnderGross,
          overUnderNeto: r.overUnderNeto,
          holesPlayed: r.holesPlayed,
          jugadores: [r.nombreA, r.nombreB],
          teamHandicap: r.teamHandicap,
        }))}
        modoJuego={ronda.modo_juego}
        formatoJuego={ronda.formato_juego}
        totalHoles={ronda.holes}
        formato="foursome"
      />
    )
  }

  return null
}
