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
// Decisión de consistencia: usamos los helpers CANÓNICOS del motor
// (`calcularHandicapScramble`/`calcularHandicapFoursome`, USGA, src/golf/formats)
// en vez de la fórmula "simplified" inline del create route (que sólo usa
// min+max para scramble y diverge en equipos de 3-4). De-dup del create route
// queda como follow-up de bajo riesgo.

import { calcularHandicapScramble, calcularHandicapFoursome } from '@/golf/formats'

/**
 * Formatos por equipos con scoring en cancha FUNCIONAL hoy: `score-grupo`
 * carga `teamEquipos` y los renderiza sólo para estos dos.
 *
 * `best_ball` queda DELIBERADAMENTE fuera: aunque es un formato por equipos
 * (`isTeamFormat` lo incluye), el scorer sólo carga `teamEquipos` para
 * scramble/foursome. Si el productor le seteara `formato_juego='best_ball'` a la
 * ronda, el scorer ocultaría el scoring individual pero no tendría equipos que
 * mostrar → pantalla en blanco. Mientras score-grupo no cargue equipos para
 * best_ball, el productor NO lo toca y best_ball sigue scoreándose como
 * individual (comportamiento actual en prod). Ver score-grupo/page.tsx:253.
 */
export const PRODUCER_TEAM_FORMATS = ['scramble', 'foursome'] as const

/** True si el productor debe materializar equipos + setear formato_juego. */
export function isProducerTeamFormat(format: string | null | undefined): boolean {
  return !!format && (PRODUCER_TEAM_FORMATS as readonly string[]).includes(format)
}

/**
 * Handicap de equipo a almacenar en `ronda_equipos.handicap_equipo`.
 *
 * - `scramble`  → fórmula USGA según nº de jugadores (2: 35/15, 3: 20/15/10,
 *                 4: 25/20/15/10), redondeo a 1 decimal.
 * - `foursome`  → (A + B) / 2 redondeado al entero (R&A 6.3b).
 * - `best_ball` → `null`: cada jugador juega con su propio handicap, no hay
 *                 handicap de equipo único.
 * - cualquier otro formato → `null`.
 *
 * El valor almacenado es la fuente de verdad: tanto score-grupo (cancha) como el
 * leaderboard leen `handicap_equipo` y lo aplican tal cual (override
 * `ScrambleTeam.teamHandicap`), garantizando que el neto coincida en ambos.
 */
export function computeStoredTeamHandicap(
  format: string,
  handicaps: number[],
): number | null {
  if (format === 'scramble') return calcularHandicapScramble(handicaps)
  if (format === 'foursome') {
    return calcularHandicapFoursome(handicaps[0] ?? 0, handicaps[1] ?? 0)
  }
  return null
}

/**
 * Handicap de un jugador del torneo para el cálculo del handicap de equipo.
 *
 * Precedencia: `profiles.indice` (índice WHS vivo, mismo dato que usa el
 * leaderboard) → `handicap_at_registration` (snapshot al inscribirse) → 0
 * (invitado sin índice ni registro). El índice 0 es válido y no cae al fallback.
 */
export function resolvePlayerHandicap(player: {
  handicap_at_registration?: number | null
  profiles?: { indice?: number | null } | null
}): number {
  return player.profiles?.indice ?? player.handicap_at_registration ?? 0
}
