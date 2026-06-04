/**
 * Funciones puras de derivación del dashboard (Mi Golf). Antes vivían inline en
 * `src/app/dashboard/page.tsx` sin tests. Extraídas acá para testearlas y para
 * que las secciones server (CompetenciaSection / IdentidadSection) las reusen.
 * Sin I/O: reciben datos ya traídos por la capa `src/lib/data/dashboard.ts`.
 */
import type { Tournament, HistoricalRound, RondaLibre } from './types'
import { getVsPar } from './par'
import type { RondaConScores } from './ultima-ronda'

const UN_DIA_MS = 86400000
const SIETE_DIAS_MS = 7 * UN_DIA_MS

export type PlayingTournament = Tournament & { horaSalida: string | null; diasRestantes: number }
export type OrganizingTournament = Tournament & { inscritos: number; hoyoActual: number | null }
export type FinishedTournament = Tournament & { posicionFinal: string | null; totalJugadores: number | null }

/** Torneos donde el usuario juega, enriquecidos con días restantes. */
export function enrichPlaying(activeTournaments: Tournament[], now: number): PlayingTournament[] {
  return activeTournaments.map((t) => {
    const diasRestantes = t.date_start
      ? Math.floor((new Date(t.date_start).getTime() - now) / UN_DIA_MS)
      : 0
    return { ...t, horaSalida: null, diasRestantes }
  })
}

/** Primer torneo dentro de la ventana de 7 días (inminente). */
export function findTorneoInminente(enrichedPlaying: PlayingTournament[], now: number): PlayingTournament | null {
  return enrichedPlaying.find(
    (t) => t.diasRestantes >= 0 && new Date(t.date_start ?? '').getTime() - now <= SIETE_DIAS_MS,
  ) ?? null
}

/** Torneos que el usuario organiza y siguen activos. */
export function enrichOrganizing(organizedTournaments: Tournament[]): OrganizingTournament[] {
  return organizedTournaments
    .filter((t) => t.status === 'open' || t.status === 'in_progress' || t.status === 'active')
    .map((t) => ({ ...t, inscritos: 0, hoyoActual: null }))
}

/** Últimos 2 torneos finalizados (jugados u organizados). */
export function buildFinalizados(
  playedTournaments: Tournament[],
  organizedTournaments: Tournament[],
): FinishedTournament[] {
  return [...playedTournaments, ...organizedTournaments]
    .filter((t) => t.status === 'finished' || t.status === 'closed')
    .slice(0, 2)
    .map((t) => ({ ...t, posicionFinal: null, totalJugadores: null }))
}

/**
 * Enriquece las rondas libres finalizadas con datos de `historical_rounds`
 * (match por course_name + fecha). `scores`/`parPerHole` arrancan en null
 * porque el historico es slim — se inyectan después solo para la última ronda
 * vía `injectUltimaRondaDetalle`.
 */
export function buildFinishedRondas(
  finishedRondasRaw: RondaLibre[],
  historico: HistoricalRound[],
): RondaConScores[] {
  return finishedRondasRaw.map((r) => {
    const match = historico.find((h) => h.course_name === r.course_name && h.played_at === r.fecha)
    return {
      ...r,
      total_gross: match?.total_gross ?? null,
      vsPar: match ? getVsPar(match.total_gross, match.holes_played) : null,
      scores: null,
      parPerHole: null,
    }
  })
}

/**
 * Inyecta el detalle hoyo-por-hoyo (scores/parPerHole) en la ronda cuyo id
 * coincide con `ultimaId`. Las demás quedan sin detalle (no lo usan). Devuelve
 * un array nuevo (no muta).
 */
export function injectUltimaRondaDetalle(
  finishedRondas: RondaConScores[],
  ultimaId: string,
  detalle: { scores: number[] | null; parPerHole: number[] | null } | null,
): RondaConScores[] {
  if (!detalle) return finishedRondas
  return finishedRondas.map((r) =>
    r.id === ultimaId ? { ...r, scores: detalle.scores, parPerHole: detalle.parPerHole } : r,
  )
}
