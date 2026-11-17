/**
 * Funciones puras de derivación del dashboard (Mi Golf). Antes vivían inline en
 * `src/app/dashboard/page.tsx` sin tests. Extraídas acá para testearlas y para
 * que las secciones server (CompetenciaSection / IdentidadSection) las reusen.
 * Sin I/O: reciben datos ya traídos por la capa `src/lib/data/dashboard.ts`.
 */
import type { Tournament, HistoricalRound, RondaLibre } from './types'
import type { RondaNormalizada } from '@/golf/stats/rondas-normalizadas'
import type { RondaConScores } from './ultima-ronda'
import { estadoDelTorneo, diasHastaFecha, type EstadoDelTorneo } from '@/golf/tournament-live-status'
import { contarInscritos } from '@/golf/tournament-status'

const DIAS_INMINENTE = 7

export type PlayingTournament = Tournament & { horaSalida: string | null; diasRestantes: number; estado: EstadoDelTorneo }
export type OrganizingTournament = Tournament & { inscritos: number; hoyoActual: number | null; estado: EstadoDelTorneo }
export type FinishedTournament = Tournament & { posicionFinal: string | null; totalJugadores: number | null }

/** Por jugar o en curso según `estadoDelTorneo` (la fuente única): lo que sigue vivo para el usuario. */
const sigueVivo = (estado: EstadoDelTorneo) => estado === 'por_jugar' || estado === 'en_curso'

/**
 * Torneos donde el usuario juega que siguen vivos (por jugar o en curso), con días
 * restantes en días calendario de Chile. Un torneo de abril que nadie cerró ya no
 * aparece en "Jugando en": sale por `estadoDelTorneo` y cae en finalizados.
 */
export function enrichPlaying(activeTournaments: Tournament[], now: number): PlayingTournament[] {
  const ahora = new Date(now)
  return activeTournaments
    .map((t) => ({ t, estado: estadoDelTorneo(t, ahora) }))
    .filter(({ estado }) => sigueVivo(estado))
    .map(({ t, estado }) => ({ ...t, horaSalida: null, diasRestantes: diasHastaFecha(t.date_start, ahora) ?? 0, estado }))
}

/**
 * Torneo del hero: primero uno EN CURSO (aunque haya empezado ayer: sábado sin cerrar
 * visto el domingo, o el día 2 de un torneo de varios días); si no, el primero por
 * jugar dentro de 7 días. Sin esto el hero decía "Sin torneos ni rondas en curso"
 * mientras la lista decía "Jugando en: En curso".
 */
export function findTorneoInminente(enrichedPlaying: PlayingTournament[], _now: number): PlayingTournament | null {
  return enrichedPlaying.find((t) => t.estado === 'en_curso')
    ?? enrichedPlaying.find((t) => !!t.date_start && t.diasRestantes >= 0 && t.diasRestantes <= DIAS_INMINENTE)
    ?? null
}

/** Torneos que el usuario organiza y siguen vivos, con la cantidad de inscritos (`contarInscritos`). */
export function enrichOrganizing(organizedTournaments: Tournament[], now: number): OrganizingTournament[] {
  const ahora = new Date(now)
  return organizedTournaments
    .map((t) => ({ t, estado: estadoDelTorneo(t, ahora) }))
    .filter(({ estado }) => sigueVivo(estado))
    .map(({ t, estado }) => ({ ...t, inscritos: contarInscritos(t.players), hoyoActual: null, estado }))
}

/**
 * Últimos 2 torneos finalizados (jugados u organizados), del más reciente al más
 * viejo. Finalizado = `estadoDelTorneo`: incluye los que nadie cerró pasada la fecha.
 * Un torneo que el usuario juega Y organiza aparece una vez.
 */
export function buildFinalizados(
  playedTournaments: Tournament[],
  organizedTournaments: Tournament[],
  now: number,
): FinishedTournament[] {
  const ahora = new Date(now)
  const vistos = new Set<string>()
  const fin = (t: Tournament) => (t.date_end ?? t.date_start ?? '').slice(0, 10)
  return [...playedTournaments, ...organizedTournaments]
    .filter((t) => {
      if (vistos.has(t.id) || estadoDelTorneo(t, ahora) !== 'finalizado') return false
      vistos.add(t.id)
      return true
    })
    .sort((a, b) => fin(b).localeCompare(fin(a)))
    .slice(0, 2)
    .map((t) => ({ ...t, posicionFinal: null, totalJugadores: null }))
}

/**
 * Fila de `historical_rounds` que corresponde a cada ronda libre (por id de ronda).
 * Primero por el vínculo exacto (`metadata.ronda_libre_jugador_id` = mi jugador en la
 * ronda). Las filas viejas sin vínculo caen a cancha + fecha, pero cada fila se usa una
 * sola vez y nunca una que ya pertenece a otra ronda: antes, dos rondas el mismo día en
 * la misma cancha mostraban las dos el score de la primera (y el Hero, la tarjeta de otra).
 * Ambas listas vienen de la más nueva a la más vieja, así que el orden se respeta.
 */
export function emparejarConHistorial(
  rondas: RondaLibre[],
  historico: HistoricalRound[],
): Map<string, HistoricalRound> {
  const pares = new Map<string, HistoricalRound>()
  const usadas = new Set<string>()
  for (const r of rondas) {
    const exacta = r.miJugadorId ? historico.find((h) => h.rondaLibreJugadorId === r.miJugadorId) : undefined
    if (exacta) { pares.set(r.id, exacta); usadas.add(exacta.id) }
  }
  for (const r of rondas) {
    if (pares.has(r.id)) continue
    const legado = historico.find((h) =>
      !usadas.has(h.id) && !h.rondaLibreJugadorId && h.course_name === r.course_name && h.played_at === r.fecha,
    )
    if (legado) { pares.set(r.id, legado); usadas.add(legado.id) }
  }
  return pares
}

/**
 * Enriquece las rondas libres finalizadas con su fila de `historical_rounds`
 * (ver `emparejarConHistorial`). `scores`/`parPerHole` arrancan en null:
 * se inyectan después solo para la última ronda vía `injectUltimaRondaDetalle`.
 *
 * vsPar: el de la ronda NORMALIZADA (pares reales, misma fuente que historial y
 * stats), y solo si la ronda entra a los números. Un scramble, un match play o una
 * parcial no muestran "vs par" (antes se inventaba par 36/72 por hoyos jugados).
 */
export function buildFinishedRondas(
  finishedRondasRaw: RondaLibre[],
  historico: HistoricalRound[],
  rondasNormalizadas: RondaNormalizada[],
): RondaConScores[] {
  const pares = emparejarConHistorial(finishedRondasRaw, historico)
  const normalizada = new Map(rondasNormalizadas.map((n) => [n.id, n]))
  return finishedRondasRaw.map((r) => {
    const match = pares.get(r.id)
    const n = match ? normalizada.get(match.id) : undefined
    return {
      ...r,
      historicoId: match?.id ?? null,
      total_gross: match?.total_gross ?? null,
      vsPar: n && n.fueraDePromedios == null ? n.vsPar : null,
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
