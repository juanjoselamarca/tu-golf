// Ranking de equipos (best_ball / scramble / foursome). Consolida los 3 bloques
// casi-duplicados del monolito en un componente con switch por formato. Verbatim
// en la construcción de cada formato.
import TeamLeaderboard from '@/components/TeamLeaderboard'
import Scorecard from '@/components/Scorecard'
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
  courseHcpMap: Record<string, number>
  fechaDisplay: string
  /** Expand de tarjeta de equipo (fix 126) — solo best_ball. */
  expandedTeam: string | null
  onToggleTeam: (teamId: string) => void
}

export function TeamLeaderboards({ ronda, equipos, parMap, siMap, courseHcpMap, fechaDisplay, expandedTeam, onToggleTeam }: TeamLeaderboardsProps) {
  if (equipos.length === 0 || Object.keys(parMap).length === 0) return null

  const holeData = Array.from({ length: ronda.holes }, (_, i) => ({
    numero: i + 1,
    par: parMap[i + 1] ?? 4,
    stroke_index: siMap[i + 1] ?? (i + 1),
  }))
  const parTotal = holeData.reduce((s, h) => s + h.par, 0)

  // Fix 126: al expandir un equipo en best ball se muestran las tarjetas
  // (Scorecard estándar) de cada miembro — igual que al tocar un jugador individual.
  const modoSuffix = ronda.modo_juego === 'neto' ? 'Neto' : 'Gross'
  const renderTeamDetail = (teamId: string) => {
    const eq = equipos.find(e => e.id === teamId)
    if (!eq) return null
    const members = eq.jugadorIds
      .map(jid => ronda.ronda_libre_jugadores.find(j => j.id === jid))
      .filter((m): m is NonNullable<typeof m> => !!m)
    return (
      <div style={{ background: 'var(--bg)', padding: '4px 0 8px' }}>
        {members.map(m => (
          <Scorecard
            key={m.id}
            holes={holeData}
            scores={m.scores}
            courseHandicap={courseHcpMap[m.id] ?? Math.round(m.handicap ?? 0)}
            modo={ronda.modo_juego as 'gross' | 'neto'}
            formato="best_ball"
            playerName={m.nombre}
            courseName={ronda.course_name}
            date={fechaDisplay}
            formatLabel={`Best Ball ${modoSuffix}`}
          />
        ))}
      </div>
    )
  }

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
        expandedTeamId={expandedTeam}
        onToggleTeam={onToggleTeam}
        renderTeamDetail={renderTeamDetail}
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
