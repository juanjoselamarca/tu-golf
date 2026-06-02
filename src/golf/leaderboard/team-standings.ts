import { calcularScramble, ordenarEquiposScramble } from '@/golf/formats'
import type { ScrambleTeam, ScrambleTeamResult } from '@/golf/formats'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'

/**
 * Compone el motor de scramble en standings ordenados de equipos.
 * Pura y defensiva: un equipo sin scores devuelve holesPlayed 0 sin crashear.
 */
export function computeScrambleStandings(
  teams: ScrambleTeam[],
  holes: Array<{ numero: number; par: number; stroke_index: number }>,
  parTotal: number,
  formato: FormatoJuego,
  modo: ModoJuego,
): ScrambleTeamResult[] {
  const results = teams.map((t) => calcularScramble(t, holes, parTotal))
  return ordenarEquiposScramble(results, formato, modo)
}
