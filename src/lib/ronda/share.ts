// ─── Builder de datos para compartir el leaderboard ─────────────────────────
// Extraído del componente monolítico [codigo]/page.tsx (job "Resultados v2").
// La construcción de LeaderboardShareData se duplicaba inline en el cuadro
// ganador y en el botón "Compartir leaderboard". Centralizado, behavior-preserving.

import type { LeaderboardShareData } from '@/lib/share-card'
import { rankTeams } from '@/lib/ronda/team-ranking'
import { buildMatchResult } from '@/lib/ronda/match'
import { puntosStablefordHoyo } from '@/golf/core/scoring'
import { isTeamFormat } from '@/golf/formats'
import type { RondaLibre } from '@/types/ronda'
import type { LeaderboardEntry } from '@/lib/ronda/leaderboard'
import type { Equipo } from '@/app/ronda-libre/[codigo]/types'

export interface BuildShareDataArgs {
  ronda: RondaLibre
  leaderboard: LeaderboardEntry[]
  equipos: Equipo[]
  parMap: Record<number, number>
  siMap: Record<number, number>
  courseHcpMap: Record<string, number>
  fechaDisplay: string
  codigo: string
  isFinished: boolean
}

/** Construye el payload para `compartirLeaderboard`, incluyendo match result y ranking de equipos. */
export function buildLeaderboardShareData({
  ronda, leaderboard, equipos, parMap, siMap, courseHcpMap, fechaDisplay, codigo, isFinished,
}: BuildShareDataArgs): LeaderboardShareData {
  const isStableford = ronda.formato_juego === 'stableford'
  const shareData: LeaderboardShareData = {
    players: leaderboard.filter(j => j.holesPlayed > 0).map(j => ({
      nombre: j.nombre,
      vsPar: isStableford ? j.stablefordPts : j.vsPar,
      holesPlayed: j.holesPlayed,
      totalHoles: ronda.holes,
    })),
    courseName: ronda.course_name,
    fecha: fechaDisplay,
    rondaCodigo: codigo,
    isFinished,
    totalHoles: ronda.holes,
    formato_juego: ronda.formato_juego,
    modo_juego: ronda.modo_juego,
  }

  // Match Play: display ("3&2", "1 UP", "All Square") para la card.
  const mr = buildMatchResult(ronda, parMap, siMap, courseHcpMap)
  if (mr) {
    const jug = ronda.ronda_libre_jugadores
    shareData.matchResult = mr.display
    shareData.matchWinner = mr.winner === 'a' ? jug[0].nombre : mr.winner === 'b' ? jug[1].nombre : undefined
  }

  // Formatos por equipo: ranking de equipos para la card.
  if (isTeamFormat(ronda.formato_juego) && equipos.length > 0 && Object.keys(parMap).length > 0) {
    shareData.teams = rankTeams({
      equipos,
      jugadores: ronda.ronda_libre_jugadores,
      parMap, siMap,
      holes: ronda.holes,
      formato: ronda.formato_juego,
      modo: ronda.modo_juego,
    })
  }

  return shareData
}

/** Texto para compartir por sistema/WhatsApp (título dinámico según estado de la ronda). */
export function buildShareText(
  ronda: RondaLibre | null,
  parMap: Record<number, number>,
  siMap: Record<number, number>,
  courseHcpMap: Record<string, number>,
): string {
  if (!ronda) return 'Sigue la ronda en vivo en Golfers+'
  const jugadores = ronda.ronda_libre_jugadores
  if (jugadores.length === 0) return `Ronda en ${ronda.course_name} — Golfers+`

  // Match Play
  const mr = buildMatchResult(ronda, parMap, siMap, courseHcpMap)
  if (mr) {
    if (mr.isFinished && mr.winner) {
      const ganador = mr.winner === 'a' ? jugadores[0].nombre : jugadores[1].nombre
      const modoLabel = ronda.modo_juego === 'neto' ? 'Match Play Neto' : 'Match Play Gross'
      return `${ganador} ganó ${mr.display} en ${ronda.course_name} — ${modoLabel}`
    }
    return `Match Play en vivo: ${mr.display} en ${ronda.course_name} — Seguila en vivo`
  }

  const isStab = ronda.formato_juego === 'stableford'
  const leader = [...jugadores]
    .map(j => {
      let gross = 0, parTotal = 0, holesPlayed = 0, stabPts = 0
      const ch = courseHcpMap[j.id] ?? Math.round(j.handicap ?? 0)
      for (let h = 1; h <= ronda.holes; h++) {
        const s = j.scores?.[String(h)] ?? j.scores?.[h]
        if (s != null) {
          gross += s; parTotal += parMap[h] ?? 4; holesPlayed++
          if (isStab) stabPts += puntosStablefordHoyo(s, parMap[h] ?? 4, ch, siMap[h] ?? h, ronda.holes)
        }
      }
      const vsPar = gross - parTotal
      return { nombre: j.nombre, gross, vsPar, holesPlayed, stabPts }
    })
    .filter(j => j.holesPlayed > 0)
    .sort((a, b) => isStab ? b.stabPts - a.stabPts : a.vsPar - b.vsPar)[0]

  if (!leader) return `Ronda en vivo en ${ronda.course_name} — Golfers+`
  if (isStab) {
    return `${leader.nombre} lleva ${leader.stabPts} pts en ${ronda.course_name} — Seguila en vivo`
  }
  const vsParStr = leader.vsPar > 0 ? `+${leader.vsPar}` : leader.vsPar === 0 ? 'E' : String(leader.vsPar)
  return `${leader.nombre} va ${leader.gross} (${vsParStr}) en ${ronda.course_name} — Seguila en vivo`
}
