// src/golf/leaderboard/build-from-legacy.ts
//
// Construye los leaderboards desde el schema legacy `players` + `rounds` +
// `hole_scores`. Multi-round aware. Devuelve TRES rankings paralelos
// (gross, neto, primario por modo del torneo) + inputs GWI + mapping
// playerId→index del ranking primario (para mostrar grupos).

import { strokesRecibidosEnHoyo, puntosStablefordHoyo } from '@/golf/core/scoring'
import { normalizedStrokeIndexByHole } from '@/golf/core/stroke-index'
import { resolveScoringCourseHcp } from '@/golf/core/compute-player-course-hcp'
import { parDeLosHoyosJugados } from '@/golf/core/course-handicap'
import type { JugadorGWIInput } from '@/golf/stats/gwi'
import type { Player } from '@/lib/golf-data'
import type { DBPlayer } from '@/app/torneo/[slug]/types'
import type {
  CourseHole,
  LeaderboardEntry,
  RoundLeaderboardContext,
  TournamentLeaderboardContext,
} from './types'
import { rankEntries, type RankingMode } from './rank-entries'
import { resolveLegacyPlayerName, parOfPlayedHoles } from './board-rules'

/**
 * Lo que el motor deriva de un contexto de ronda, calculado UNA vez por ronda
 * y no por jugador: par de la ronda, mapa de hoyos y SI normalizado.
 *
 * Existe porque un torneo multi-ronda puede jugar cada ronda en una cancha
 * distinta (decisión PM 25-sep-2026): el course handicap, el par y el stroke
 * index con los que se puntúa la ronda 2 son los de la cancha de la ronda 2.
 * Antes el motor asumía la cancha de la ronda 1 para todas.
 */
interface RoundEngine {
  ctx: RoundLeaderboardContext
  totalHoyos: number
  parTotal: number
  parDeLaRonda: number
  holeMap: Map<number, CourseHole>
  siAlloc: Record<number, number>
}

function roundEngine(ctx: RoundLeaderboardContext): RoundEngine {
  return {
    ctx,
    totalHoyos: ctx.totalHoyos,
    parTotal: ctx.parTotal,
    // El par que entra a la fórmula del course handicap es el de los hoyos que
    // se JUEGAN (`parDeLosHoyosJugados`), no el de la cancha: mezclar el CR de
    // 9h con el par de 18 da course handicaps negativos. Idéntico a scoring/page.tsx.
    parDeLaRonda: parDeLosHoyosJugados(ctx.courseHoles, ctx.totalHoyos),
    holeMap: new Map(ctx.courseHoles.map((h) => [h.numero, h])),
    // SI normalizado a permutación 1..N para alocar golpes (mismo motivo que
    // build-from-ronda-libre: SI 18h-impar en loop de 9h perdía golpes). No-op si
    // el SI ya es permutación válida. No cambia el SI que se MUESTRA.
    siAlloc: normalizedStrokeIndexByHole(ctx.courseHoles, ctx.totalHoyos),
  }
}

/**
 * Course handicap de un jugador PARA UNA RONDA: MISMA cuenta que la tarjeta en
 * cancha (`resolveScoringCourseHcp`, el gate por torneo).
 *
 * `strokesRecibidosEnHoyo` reparte un COURSE HANDICAP, no un índice. El scorer
 * del organizador ya le pasa el course handicap WHS del tee del jugador; este
 * board le pasaba el índice crudo, así que las dos pantallas del mismo torneo
 * mostraban netos distintos. En 18 hoyos sobre cancha estándar (slope 113,
 * CR ≈ par) la diferencia es ~0; en 9 hoyos el índice reparte el DOBLE de los
 * golpes que corresponden (WHS: el course handicap de 9h sale del índice/2).
 *
 * La categoría viaja entera: `default_tee_color` es el eslabón "category" del
 * fallback de tee, y con canchas distintas por ronda es el que resuelve el tee
 * por NOMBRE en la cancha de cada ronda.
 */
function courseHcpDeEnRonda(p: DBPlayer, eng: RoundEngine): number {
  const hcpCtx = eng.ctx.hcp ?? null
  return resolveScoringCourseHcp(
    hcpCtx?.mode ?? null,
    {
      handicap_at_registration: p.handicap_at_registration,
      tee_id: p.tee_id ?? null,
      categories: p.categories ? { default_tee_color: p.categories.default_tee_color ?? null } : null,
    },
    { tees: hcpCtx?.tees ?? null, courses: hcpCtx?.course ?? null },
    hcpCtx?.courseTees ?? [],
    eng.parDeLaRonda,
    eng.totalHoyos,
  )
}

export interface LegacyLeaderboardOutput {
  players: Player[]
  playersByGross: Player[]
  playersByNeto: Player[]
  gwiInputs: JugadorGWIInput[]
  /** dbPlayerId → index dentro de `players` (ranking primario). */
  playerIdToIndex: Record<string, number>
}

export function buildLeaderboardFromLegacy(
  dbPlayers: DBPlayer[],
  ctx: TournamentLeaderboardContext,
  tournamentTotalRounds: number,
): LegacyLeaderboardOutput {
  const { totalHoyos, parTotal, modoJuego, formatoJuego } = ctx
  const playerIdToIndex: Record<string, number> = {}

  if (dbPlayers.length === 0) {
    return {
      players: [],
      playersByGross: [],
      playersByNeto: [],
      gwiInputs: [],
      playerIdToIndex,
    }
  }

  const isMultiRound = tournamentTotalRounds > 1
  const withRounds = dbPlayers.filter((p) => p.rounds?.length > 0)

  // ── Contexto base (la ronda 1) + contexto propio de cada ronda que se juega
  // en otra cancha. Las rondas sin entrada en `ctx.rounds` usan el base. ──
  const base = roundEngine(ctx)
  const engineCache = new Map<number, RoundEngine>()
  const engineDeRonda = (roundNumber: number): RoundEngine => {
    const propio = ctx.rounds?.get(roundNumber)
    if (!propio) return base
    let eng = engineCache.get(roundNumber)
    if (!eng) {
      eng = roundEngine(propio)
      engineCache.set(roundNumber, eng)
    }
    return eng
  }
  const courseHcpDe = (p: DBPlayer): number => courseHcpDeEnRonda(p, base)
  /** El ÍNDICE del jugador, tal cual quedó inscrito. Es lo que se MUESTRA en la
   *  columna HCP (12.0 sigue siendo 12.0) y nunca lo toca la corrección de golpes. */
  const indiceDe = (p: DBPlayer): number => p.handicap_at_registration ?? 0

  const { holeMap, siAlloc } = base

  // ── Entries crudos (multi-round aware). ──
  // Cada entry incluye también su dbPlayerId para reconstruir playerIdToIndex
  // sobre el ranking primario después de ordenar.
  interface LegacyEntryWithMeta extends LeaderboardEntry {
    dbPlayerId: string
    todayVsPar: number
  }

  const entries: LegacyEntryWithMeta[] = withRounds.map((p) => {
    const sortedRounds = [...(p.rounds || [])].sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1))

    let cumulGross = 0, cumulNet = 0, cumulPoints = 0, totalHolesPlayed = 0
    let cumulParPlayed = 0
    let todayNet = 0
    let latestScores = new Array(totalHoyos).fill(null) as (number | null)[]
    // El handicap y el motor de la ÚLTIMA ronda jugada: son los que acompañan
    // a `latestScores` (la tarjeta que se muestra) y a los puntos stableford
    // por hoyo de abajo.
    let latest = base
    let hcp = courseHcpDe(p)
    let allFinished = true

    for (const round of sortedRounds) {
      // Cada ronda se puntúa con la cancha en que SE JUEGA: su par, su SI, su
      // course handicap. En un torneo que repite cancha, `eng === base` siempre.
      const eng = engineDeRonda(round.round_number ?? 1)
      const { holeMap, siAlloc, totalHoyos, parTotal } = eng
      hcp = eng === latest ? hcp : courseHcpDeEnRonda(p, eng)
      latest = eng

      const scores = new Array(totalHoyos).fill(null) as (number | null)[]
      ;(round.hole_scores || []).forEach((hs) => {
        if (hs.gross_score != null && hs.hole_number <= totalHoyos) scores[hs.hole_number - 1] = hs.gross_score
      })
      const playedHoles: number[] = []
      scores.forEach((s, i) => { if (s !== null) playedHoles.push(i + 1) })

      // Con detalle por hoyo el neto se DERIVA de los scores (mismo cálculo que
      // el scorer y que build-from-ronda-libre). No se confía en `total_net`
      // almacenado: es una columna denormalizada que escribe /api/game y que
      // queda en 0 si los scores entraron por cualquier otro camino — de ahí
      // salían los "líderes" a −72 que nadie había jugado.
      let roundGross: number, roundNet: number, roundPoints: number, roundPar: number
      if (playedHoles.length > 0) {
        roundGross = 0; roundNet = 0; roundPoints = 0
        for (const h of playedHoles) {
          const gross = scores[h - 1] as number
          const hole = holeMap.get(h)
          const si = siAlloc[h] ?? hole?.stroke_index ?? h
          roundGross += gross
          roundNet += gross - strokesRecibidosEnHoyo(hcp, si, totalHoyos)
          if (hole) roundPoints += puntosStablefordHoyo(gross, hole.par, hcp, si, totalHoyos)
        }
        roundPar = parOfPlayedHoles(eng.ctx.courseHoles, playedHoles)
      } else {
        // Ronda sin detalle por hoyo (sólo totales cargados): se usa lo
        // almacenado y se asume vuelta completa, tanto para la referencia de
        // par como para los hoyos jugados. Sin lo segundo el jugador quedaba en
        // `holesPlayed = 0` y todo el pipeline lo trataba como "sin datos": se
        // mostraba en "—" y caía al fondo del ranking teniendo tarjeta.
        roundGross = round.total_gross ?? 0
        roundPoints = round.total_points ?? 0
        // `total_net` en 0 NO es "hizo 0 golpes netos": es la columna sin
        // escribir (19 de 77 rondas de prod están así). `??` no lo atrapa
        // porque 0 no es null, y con el neto en 0 el jugador salía a −72 y
        // lideraba el board neto.
        //
        // Se deriva del bruto MENOS su course handicap, no se iguala al bruto:
        // esta rama ya asume vuelta completa (`roundPar = parTotal`), así que el
        // jugador recibe exactamente sus golpes. Igualarlo al bruto sería tratar
        // a todos como handicap 0 — que castiga en silencio al de handicap alto
        // y, en un jugador PLUS, lo FAVORECE: por WHS Apéndice E el plus
        // DEVUELVE golpes (`strokesRecibidosEnHoyo` lo implementa), así que su
        // neto real es mayor que su bruto. Prod tiene un plus (−2.0 en
        // `gate-scorer-9h-individual`).
        roundNet = round.total_net && round.total_net > 0 ? round.total_net : roundGross - hcp
        roundPar = roundGross > 0 ? parTotal : 0
      }
      const roundHolesPlayed = playedHoles.length > 0
        ? playedHoles.length
        : (roundGross > 0 ? totalHoyos : 0)

      cumulGross += roundGross
      cumulNet += roundNet
      cumulPoints += roundPoints
      cumulParPlayed += roundPar
      totalHolesPlayed += roundHolesPlayed
      todayNet = roundPar > 0 ? roundNet - roundPar : 0

      if (round.status !== 'closed' && round.status !== 'official') allFinished = false
      latestScores = scores
    }

    const roundsPlayed = sortedRounds.length
    // "A par" contra los hoyos jugados, no contra la vuelta entera.
    const netVsPar = totalHolesPlayed > 0 ? cumulNet - cumulParPlayed : 0

    // Puntos por hoyo de la tarjeta que se MUESTRA (la última ronda), con el
    // motor de ESA ronda: su par, su SI y su course handicap.
    const stablefordScores: number[] = formatoJuego === 'stableford'
      ? Array.from({ length: latest.totalHoyos }, (_, i) => {
          const h = i + 1
          const gross = latestScores[i] ?? 0
          if (gross === 0) return 0
          const hole = latest.holeMap.get(h)
          if (!hole) return 0
          return puntosStablefordHoyo(gross, hole.par, hcp, (latest.siAlloc[hole.numero] ?? hole.stroke_index), latest.totalHoyos)
        })
      : []

    return {
      id: p.id,
      name: resolveLegacyPlayerName(p),
      cat: p.categories?.name ? `Cat. ${p.categories.name}` : 'General',
      handicap: hcp,
      // La columna HCP del board sigue mostrando el ÍNDICE del jugador, igual que
      // antes de este fix y que la ficha del scorer. Sólo cambian los GOLPES que
      // se reparten (`handicap`), nunca el número a la vista.
      hcpDisplay: indiceDe(p),
      grossTotal: cumulGross,
      netTotal: cumulNet,
      stablefordTotal: cumulPoints,
      stablefordScores,
      vsPar: netVsPar,
      parPlayed: cumulParPlayed,
      holesPlayed: totalHolesPlayed,
      roundsPlayed,
      scores: latestScores,
      status: (allFinished ? 'F' : 'live') as 'F' | 'live',
      dbPlayerId: p.id,
      todayVsPar: isMultiRound ? todayNet : netVsPar,
    }
  })

  const primaryMode: RankingMode = formatoJuego === 'stableford' ? 'stableford' : modoJuego
  const rankOpts = { parTotal, formatoJuego }

  // rankEntries devuelve { players, order } donde order[i] es el índice del
  // entry original cuyo Player quedó en posición final i (POST-countback).
  // Usamos `order` para mapear `todayVsPar` y `dbPlayerId` al orden final;
  // antes los mapeábamos pre-countback y los empates rompían el mapeo.
  const applyToday = (players: Player[], order: number[]): Player[] =>
    players.map((p, idx) => {
      const originalIdx = order[idx]
      const e = entries[originalIdx]
      return { ...p, today: e?.todayVsPar ?? p.today }
    })

  const primaryRanked = rankEntries(entries, primaryMode, rankOpts)
  const grossRanked = rankEntries(entries, 'gross', rankOpts)
  const netoRanked = rankEntries(entries, 'neto', rankOpts)

  const primaryPlayers = applyToday(primaryRanked.players, primaryRanked.order)
  const playersByGross = applyToday(grossRanked.players, grossRanked.order)
  const playersByNeto = applyToday(netoRanked.players, netoRanked.order)

  // playerIdToIndex sobre el ranking primario, usando el order FINAL.
  primaryRanked.order.forEach((originalIdx, finalIdx) => {
    const e = entries[originalIdx]
    if (e) playerIdToIndex[e.dbPlayerId] = finalIdx
  })

  // ── Jugadores sin ronda aún (inscritos, no empezaron). ──
  // Se agregan al final del ranking primario. NO van a gross/neto rankings
  // (no tienen datos), pero el playerIdToIndex sí los registra para que
  // los grupos puedan localizarlos.
  const noRound = dbPlayers.filter((p) => !p.rounds?.length)
  noRound.forEach((p, i) => {
    const playerIdx = primaryPlayers.length
    primaryPlayers.push({
      pos:     withRounds.length + i + 1,
      // Sin `id` la fila no matchea ningún filtro de /en-vivo (grupo, categoría,
      // "solo mi grupo") y todas comparten key="" en React.
      id:      p.id,
      name:    resolveLegacyPlayerName(p),
      country: 'CL',
      cat:     p.categories?.name ? `Cat. ${p.categories.name}` : 'General',
      hcp:     courseHcpDe(p),
      hcpDisplay: indiceDe(p),
      today:   0,
      total:   0,
      holes:   0,
      status:  'live',
      scores:  new Array(totalHoyos).fill(null),
    })
    playerIdToIndex[p.id] = playerIdx
  })

  // ── GWI inputs (independientes del orden). ──
  const gwiInputs: JugadorGWIInput[] = dbPlayers
    .filter((p) => p.rounds?.length > 0)
    .map((p) => {
      // Los golpes se reparten con el COURSE handicap (igual que el board), pero el
      // GWI modela la varianza por ÍNDICE de skill — por eso `handicapIndex` abajo
      // conserva el índice crudo. Misma separación que en el camino de ronda libre.
      const courseHcp = courseHcpDe(p)
      const hcp = p.handicap_at_registration ?? 18
      const holeScores = p.rounds[0].hole_scores ?? []
      let overUnderGross = 0, overUnderNeto = 0, totalSF = 0, hoyosComp = 0

      for (const hs of holeScores) {
        if (!hs.gross_score) continue
        const hole = holeMap.get(hs.hole_number)
        if (!hole) continue
        hoyosComp++
        overUnderGross += hs.gross_score - hole.par
        overUnderNeto  += (hs.gross_score - strokesRecibidosEnHoyo(courseHcp, (siAlloc[hole.numero] ?? hole.stroke_index), totalHoyos)) - hole.par
        totalSF        += puntosStablefordHoyo(hs.gross_score, hole.par, courseHcp, (siAlloc[hole.numero] ?? hole.stroke_index), totalHoyos)
      }

      const currentScore = formatoJuego === 'stableford'
        ? totalSF
        : modoJuego === 'neto' ? overUnderNeto : overUnderGross

      return {
        id:                   p.id,
        nombre:               resolveLegacyPlayerName(p),
        handicapIndex:        hcp,
        currentScore,
        hoyosCompletados:     hoyosComp,
        modoJuego,
        formatoJuego,
        historicalAvg:        null,
        historicalRoundsCount: 0,
        courseAvg:            null,
        courseRoundsCount:    0,
        patterns:             null,
      } satisfies JugadorGWIInput
    })

  return {
    players: primaryPlayers,
    playersByGross,
    playersByNeto,
    gwiInputs,
    playerIdToIndex,
  }
}
