// src/lib/data/tournaments/teamRounds.ts
//
// Productor de equipos al iniciar un torneo de formato por equipos. En el modelo
// elegido por PM (PR #85) el grupo de salida ES el equipo, así que al arrancar
// el torneo cada grupo necesita su `ronda_equipos` + `ronda_equipo_jugadores`
// para que (a) el scorer en cancha (score-grupo) enganche el scoring de equipo
// y (b) el leaderboard de equipos tenga datos que mostrar.
//
// GAP que cierra (02-jun): `handleStartTournament` creaba `rondas_libres` +
// `ronda_libre_jugadores` pero NUNCA `ronda_equipos` → los 4 torneos scramble en
// prod tenían 0 equipos y el leaderboard salía vacío. Ver
// project_wizard_equipos_roto (memoria) y el flujo espejo en
// `api/ronda-libre/create/route.ts`.
//
// Handicap de equipo (PR-C): sale de la fuente canónica
// (`handicapDeEquipo`, src/golf/formats/team-handicap.ts) aplicada sobre el
// course handicap SIN redondear de cada jugador, con la MISMA cadena que su
// handicap individual en el torneo (`courseHandicapSinRedondearDelTorneo`).

import { TEAM_FORMAT_KEYS, isTeamFormat } from '@/golf/formats'
import { handicapDeEquipo, type TeamHandicapConfig } from '@/golf/formats/team-handicap'
import {
  courseHandicapSinRedondearDelTorneo,
  esModoHcpWhs,
  type PlayerForCourseHcp,
} from '@/golf/core/compute-player-course-hcp'
import type { LegacyHcpContext } from '@/golf/leaderboard/types'

/**
 * Formatos por equipos con scoring en cancha FUNCIONAL: `score-grupo` carga
 * `teamEquipos` y los renderiza para los tres.
 *
 * - `scramble` / `foursome`: una sola bola por equipo → score COMPARTIDO en
 *   `ronda_equipos.scores`. El productor almacena `handicap_equipo` (completo,
 *   18 hoyos) y `handicap_equipo_juego` (el que puntúa en los hoyos de la ronda).
 * - `best_ball`: cada jugador su bola → score INDIVIDUAL en `ronda_libre_jugadores`.
 *   `ronda_equipos` se materializa SÓLO para la membresía (qué jugadores forman el
 *   equipo); su `scores` queda vacío y ambos handicaps de equipo son `null` (cada
 *   jugador juega con su propio handicap de juego: course handicap × `hcp_pct`). El
 *   scorer (`BestBallTeamCard`) y el leaderboard (`fetchBestBallTeams` → `calcularBestBall`) leen los scores
 *   individuales y toman la mejor bola neta por hoyo. Ver score-grupo/page.tsx:253.
 *
 * best_ball se habilitó (03-jun) una vez que score-grupo carga `teamEquipos` para
 * él y el leaderboard público lo computa end-to-end. Antes quedaba fuera para no
 * dejar el scorer en blanco (cargaba 0 equipos y ocultaba el scoring individual).
 */
/** Formatos que el productor materializa como equipos. Alias del canónico (golf/formats, category 'team'). */
export const PRODUCER_TEAM_FORMATS = TEAM_FORMAT_KEYS

/** True si el productor debe materializar equipos + setear formato_juego. */
export function isProducerTeamFormat(format: string | null | undefined): boolean {
  return isTeamFormat(format)
}

/** Los dos handicaps de equipo que se guardan en `ronda_equipos`. */
export interface HandicapsDeEquipo {
  /** `handicap_equipo`: escala de 18 hoyos, el que se muestra. */
  completo: number | null
  /**
   * `handicap_equipo_juego`: el que reparte golpes, en la escala de los hoyos
   * de la ronda. `null` en modo raw/legacy: el motor parte el completo como
   * siempre (`handicapDeEquipoParaHoyos`).
   */
  juego: number | null
}

/**
 * Handicaps de equipo de un grupo al iniciar el torneo.
 *
 * - Modo WHS: el % de equipo (oficial o personalizado, `handicap`) se aplica al
 *   course handicap sin redondear de cada jugador, con su tee. `completo` se
 *   mide sobre 18 hoyos; `juego`, sobre los hoyos de la ronda (en 9 hoyos usa
 *   los ratings de 9: WHS 6.1b). En 18 hoyos son el mismo número.
 * - Modo raw/legacy: lo inscrito ya es un course handicap de 18 hoyos (la
 *   inscripción lo convierte con los ratings de 18); `completo` se calcula con
 *   eso y `juego` queda `null` (el motor lo parte como siempre lo hizo).
 * - best ball y formatos sin handicap de equipo → `{ null, null }`.
 *
 * `null` también si el tamaño no tiene asignación o el personalizado no calza
 * con los jugadores: `motivoParaNoIniciar` bloquea esos casos antes de llegar acá.
 *
 * `parTotal` y `holeCount` son los de la ronda; `parDe18Hoyos`, el de una
 * ronda de 18 en la misma cancha (ambos de `parDeLaRondaDelTorneo`: una cancha
 * de 9 se recorre dos veces).
 */
export function handicapsDeEquipoDelGrupo(args: {
  formato: string | null | undefined
  members: readonly PlayerForCourseHcp[]
  handicap: TeamHandicapConfig | null | undefined
  ctx: LegacyHcpContext
  parTotal: number
  holeCount: number
  parDe18Hoyos: number
}): HandicapsDeEquipo {
  const { formato, members, handicap, ctx, parTotal, holeCount, parDe18Hoyos } = args
  const torneo = { tees: ctx.tees, courses: ctx.course }
  const equipoEn = (par: number, hoyos: number) =>
    handicapDeEquipo(
      formato,
      members.map((p) => courseHandicapSinRedondearDelTorneo(ctx.mode, p, torneo, ctx.courseTees, par, hoyos)),
      handicap,
    )

  // Ronda de menos de 18: el completo se mide con el par de 18 hoyos (de 18 o
  // de 9 recorrida dos veces), no con el de la media vuelta que se juega.
  const completo = holeCount >= 18 ? equipoEn(parTotal, holeCount) : equipoEn(parDe18Hoyos, 18)
  if (completo == null) return { completo: null, juego: null }
  if (!esModoHcpWhs(ctx.mode)) return { completo, juego: null }
  return { completo, juego: holeCount >= 18 ? completo : equipoEn(parTotal, holeCount) }
}

/**
 * Handicap de un jugador del torneo para `ronda_libre_jugadores.handicap` (la
 * fila del jugador en la tarjeta del grupo). NO es el que puntúa en el equipo:
 * ese es `handicapsDeEquipoDelGrupo`.
 *
 * Precedencia: `profiles.indice` (índice WHS vivo) → `handicap_at_registration`
 * (snapshot al inscribirse) → 0 (invitado sin índice ni registro). El índice 0
 * es válido y no cae al fallback.
 */
export function resolvePlayerHandicap(player: {
  handicap_at_registration?: number | null
  profiles?: { indice?: number | null } | null
}): number {
  return player.profiles?.indice ?? player.handicap_at_registration ?? 0
}
