import {
  calcularScramble, ordenarEquiposScramble,
  calcularFoursome, ordenarEquiposFoursome,
  calcularBestBall, ordenarEquiposBestBall,
} from '@/golf/formats'
import type {
  ScrambleTeam, ScrambleTeamResult, FoursomeTeamResult,
  BestBallTeam, BestBallTeamResult,
} from '@/golf/formats'
import type { FormatoJuego, ModoJuego } from '@/golf/core/rules'

type Hole = { numero: number; par: number; stroke_index: number }

/**
 * Filtra el recorrido a los hoyos que se juegan en el round (numero <= roundHoles).
 *
 * FUENTE ÚNICA del "set de hoyos del round" para el board de equipos. En prod los
 * torneos de 9h corren sobre canchas con `course_holes` numero 1..18, y los
 * callers (torneo/[slug]/page.tsx, en-vivo) pasan las 18 filas. Sin este filtro
 * los engines derivan `roundHoles = sortedHoles.length = 18` y entonces:
 *  (a) el team handicap NO se divide para 9h (`courseHandicapParaHoyos(H, 18) = H`)
 *      → reparten ~2× golpes en canchas donde el front-9 no es el split USGA impar;
 *  (b) el SI se normaliza sobre 18 (no-op si ya es válido 1..18) → el front-9
 *      conserva valores esparcidos y el 9h pierde golpes (bug "net +12");
 *  (c) el countback del desempate (#249) ve `holeCount=18` → cae al card-off.
 * `roundHoles` omitido = sin filtro (compat: el path ronda-libre ya pasa 9 hoyos).
 *
 * INVARIANTE: un torneo de 9h juega los hoyos 1..9 (front-9). La creación de
 * torneo sólo persiste `hole_count` (9|18), sin selector de "qué nueve", y el
 * write path (`api/game/actions.ts`, `.lte('numero', roundHoles)`) asume lo mismo.
 * Si algún día se agrega selección de back-9 en la creación, ESTE filtro (y el
 * write path) deben pasar a filtrar por el set real de hoyos jugados, no `1..N`.
 */
function holesDelRound(holes: Hole[], roundHoles?: number): Hole[] {
  return roundHoles != null ? holes.filter((h) => h.numero <= roundHoles) : holes
}

/**
 * Compone el motor de scramble en standings ordenados de equipos.
 * Pura y defensiva: un equipo sin scores devuelve holesPlayed 0 sin crashear.
 */
export function computeScrambleStandings(
  teams: ScrambleTeam[],
  holes: Hole[],
  parTotal: number,
  formato: FormatoJuego,
  modo: ModoJuego,
  roundHoles?: number,
): ScrambleTeamResult[] {
  const hs = holesDelRound(holes, roundHoles)
  const results = teams.map((t) => calcularScramble(t, hs, parTotal))
  return ordenarEquiposScramble(results, formato, modo)
}

/**
 * Compone el motor de foursome en standings ordenados de equipos.
 *
 * Reusa los `ScrambleTeam` genéricos que devuelve `fetchScrambleTeams`
 * (id/nombre/handicaps/scores) y los mapea a `FoursomeTeam`: handicapA/B son los
 * dos primeros índices del equipo, nombreA/B salen de `memberNames` (sólo
 * afectan el detalle de quién sale en cada hoyo, no el total del board). El
 * handicap de equipo lo recalcula `calcularFoursome` ((A+B)/2), idéntico al
 * `handicap_equipo` almacenado (mismo helper canónico tras el de-dup del create
 * route / productor), así que el neto del board cuadra con la tarjeta en cancha.
 *
 * Pura y defensiva: un equipo sin scores devuelve holesPlayed 0 sin crashear.
 */
export function computeFoursomeStandings(
  teams: ScrambleTeam[],
  memberNames: Record<string, string[]>,
  holes: Hole[],
  parTotal: number,
  formato: FormatoJuego,
  modo: ModoJuego,
  roundHoles?: number,
): FoursomeTeamResult[] {
  const hs = holesDelRound(holes, roundHoles)
  const results = teams.map((t) => {
    const names = memberNames[t.id] ?? []
    return calcularFoursome(
      {
        id: t.id,
        nombre: t.nombre,
        handicapA: t.handicaps[0] ?? 0,
        handicapB: t.handicaps[1] ?? 0,
        nombreA: names[0] ?? '',
        nombreB: names[1] ?? '',
        scores: t.scores,
        // Override con el handicap almacenado (paridad con scramble): el board
        // usa el mismo valor congelado que aplicó la tarjeta en cancha, así no
        // divergen si el índice de un jugador cambia mid-torneo.
        teamHandicap: t.teamHandicap,
      },
      hs,
      parTotal,
    )
  })
  return ordenarEquiposFoursome(results, formato, modo)
}

/**
 * Compone el motor de best_ball en standings ordenados de equipos.
 *
 * A diferencia de scramble/foursome (un score COMPARTIDO por equipo), best_ball
 * recibe `BestBallTeam` con los scores INDIVIDUALES de cada jugador y su course
 * handicap (ver `fetchBestBallTeams`). El motor toma la mejor bola neta (o gross)
 * por hoyo y suma. El neto coincide con la tarjeta en cancha (`calcBestBallTotals`)
 * porque ambos usan `strokesRecibidosEnHoyo` con el mismo course handicap.
 *
 * `formato` enruta el desempate en `scorePrimarioBestBall`: como el scorer de
 * best_ball sólo hace gross/neto (no stableford), pasamos el formato del torneo
 * (`'best_ball'`, ≠ `'stableford'`) y el orden cae a overUnder por `modo`.
 *
 * Pura y defensiva: un equipo sin scores devuelve holesPlayed 0 sin crashear.
 */
export function computeBestBallStandings(
  teams: BestBallTeam[],
  holes: Hole[],
  parTotal: number,
  formato: FormatoJuego,
  modo: ModoJuego,
  roundHoles?: number,
): BestBallTeamResult[] {
  const hs = holesDelRound(holes, roundHoles)
  const results = teams.map((t) => calcularBestBall(t, hs, parTotal))
  return ordenarEquiposBestBall(results, formato, modo)
}
