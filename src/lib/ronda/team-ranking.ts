import { calcularBestBall, calcularScramble, calcularFoursome } from '@/golf/formats'
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
  handicap_equipo: number | null
  jugadorIds: string[]
  scores: Record<string, number>
}

export type JugadorRanking = Pick<Jugador, 'id' | 'nombre' | 'scores'> & { handicap?: number | null }

export interface RankTeamsInput {
  equipos: Equipo[]
  jugadores: JugadorRanking[]
  parMap: Record<number, number>
  siMap: Record<number, number>
  holes: number
  formato: FormatoJuego
  modo: ModoJuego
}

export interface TeamShareRow {
  nombre: string
  jugadores: string[]
  score: number
  diff: number
}

export function rankTeams(input: RankTeamsInput): TeamShareRow[] {
  const { equipos, jugadores, parMap, siMap, holes, formato, modo } = input

  if (!['best_ball', 'scramble', 'foursome'].includes(formato)) return []
  if (equipos.length === 0 || Object.keys(parMap).length === 0) return []

  const holeData = Array.from({ length: holes }, (_, i) => ({
    numero: i + 1, par: parMap[i + 1] ?? 4, stroke_index: siMap[i + 1] ?? (i + 1),
  }))
  const parTotal = holeData.reduce((s, h) => s + h.par, 0)

  const teamResults = equipos.map(eq => {
    if (formato === 'best_ball') {
      const players = eq.jugadorIds.map(jid => {
        const j = jugadores.find(jj => jj.id === jid)
        return j ? { id: j.id, nombre: j.nombre, handicapIndex: j.handicap ?? 0, scores: j.scores || {} } : null
      }).filter(Boolean) as Array<{ id: string; nombre: string; handicapIndex: number; scores: Record<string, number> }>
      return calcularBestBall({ id: eq.id, nombre: eq.nombre, jugadores: players }, holeData, parTotal)
    } else if (formato === 'scramble') {
      const handicaps = eq.jugadorIds.map(jid => {
        const j = jugadores.find(jj => jj.id === jid)
        return j?.handicap ?? 0
      })
      return calcularScramble({ id: eq.id, nombre: eq.nombre, handicaps, scores: eq.scores }, holeData, parTotal)
    } else {
      const members = eq.jugadorIds.map(jid => {
        const j = jugadores.find(jj => jj.id === jid)
        return { nombre: j?.nombre ?? '', handicap: j?.handicap ?? 0 }
      })
      return calcularFoursome({
        id: eq.id, nombre: eq.nombre,
        nombreA: members[0]?.nombre ?? '', nombreB: members[1]?.nombre ?? '',
        handicapA: members[0]?.handicap ?? 0, handicapB: members[1]?.handicap ?? 0,
        scores: eq.scores,
      }, holeData, parTotal)
    }
  })

  // Bug fix Apr-18: isStab SOLO por formato. Stableford no es formato de equipo,
  // pero dejamos el flag por consistencia arquitectónica y defensa en profundidad.
  const isStab = (formato as string) === 'stableford'
  const isNeto = modo === 'neto'

  const sorted = [...teamResults].sort((a, b) => isStab
    ? (b.totalStableford ?? 0) - (a.totalStableford ?? 0)
    : isNeto
      ? (a.overUnderNeto ?? 999) - (b.overUnderNeto ?? 999)
      : (a.totalGross ?? 999) - (b.totalGross ?? 999)
  )

  return sorted.map(r => ({
    nombre: r.teamNombre,
    jugadores: equipos.find(e => e.id === r.teamId)?.jugadorIds
      .map(jid => jugadores.find(j => j.id === jid)?.nombre || '').filter(Boolean) || [],
    score: isStab ? (r.totalStableford ?? 0) : isNeto ? (r.totalNeto ?? r.totalGross) : r.totalGross,
    diff: isStab ? 0 : isNeto ? (r.overUnderNeto ?? 0) : (r.overUnderGross ?? 0),
  }))
}
