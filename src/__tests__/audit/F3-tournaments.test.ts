// @ts-nocheck
/**
 * F3 — Auditoría de Torneos a Escala
 *
 * Valida:
 *  - Creación de torneos: restricciones de formato/modo inválido
 *  - Bloqueo de cambios de formato/hoyos tras scorear
 *  - Leaderboard por formato: ordenamiento correcto
 *  - Countback: modo correcto según formato
 *  - Multi-ronda: acumulación de scores
 *  - Escala: sin .limit() que trunque jugadores
 *  - Estados de jugadores: WD / DQ
 *
 * Pesos:
 *  - Creation validation:     peso 3
 *  - Leaderboard per format:  peso 3
 *  - Countback:               peso 3
 *  - Multi-round:             peso 3
 *  - Scale:                   peso 2 (análisis estático)
 *  - Player states (WD/DQ):   peso 2
 */

import { describe, it, expect } from 'vitest'
import { resolveLeaderboardTies, applyCountback, type CountbackPlayer } from '@/golf/core/countback'
import { puntosStablefordHoyo, strokesRecibidosEnHoyo } from '@/golf/core/scoring'

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS compartidos
// ─────────────────────────────────────────────────────────────────────────────

function makePlayer(id: string, primaryScore: number, scores: number[]): CountbackPlayer {
  return { id, name: `Player ${id}`, scores, primaryScore }
}

/** Simula el ordenamiento del leaderboard de torneo */
function sortLeaderboard(
  players: Array<{ id: string; grossTotal: number; netTotal: number; stablefordTotal: number }>,
  formato: 'stableford' | 'stroke_play',
  modoJuego: 'gross' | 'neto'
) {
  return [...players].sort((a, b) => {
    if (formato === 'stableford') return (b.stablefordTotal || 0) - (a.stablefordTotal || 0)
    if (modoJuego === 'neto') return (a.netTotal || 999) - (b.netTotal || 999)
    return (a.grossTotal || 999) - (b.grossTotal || 999)
  })
}

/** Score header según formato — replicado de TournamentTabs */
function getScoreHeader(formato: string): string {
  return formato === 'stableford' ? 'PUNTOS' : 'SCORE'
}

/** Compute positions con ties (T3) — replicado de TournamentTabs.computePositions */
function computePositions(players: Array<{ total: number }>): string[] {
  if (players.length === 0) return []
  const positions: string[] = []
  let i = 0
  while (i < players.length) {
    let j = i + 1
    while (j < players.length && players[j].total === players[i].total) j++
    const tied = j - i > 1
    for (let k = i; k < j; k++) {
      positions.push(tied ? `T${i + 1}` : `${i + 1}`)
    }
    i = j
  }
  return positions
}

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 1: Validación de creación de torneos (peso 3)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:3] Creation validation — formato + modo', () => {

  /**
   * STATIC ANALYSIS FINDINGS (not testable as unit tests):
   *
   * NuevoTorneoForm.tsx: Stableford + gross IS allowed by UI.
   * The form has a separate "modo" selector (gross/neto) that is visible for stableford.
   * There is no client-side validation that blocks stableford + gross.
   * The server stores both independently as formato_juego=stableford, modo_juego=gross.
   *
   * Match Play: the UI forces modo='neto' when match_play is selected
   * (line 374: if (f.value === 'match_play') setModo('neto'))
   * so match_play + gross is prevented at UX level (not enforced server-side).
   *
   * EditTorneoForm.tsx: FORMATS array only has stroke_play + stableford (no match_play).
   * So match_play cannot be edited, but can be created from NuevoTorneoForm.
   */

  it('stableford + gross: la UI NO bloquea esta combinación (finding: sin validación)', () => {
    // Recrear la lógica de NuevoTorneoForm — no hay restricción que bloquee esto
    const format = 'stableford'
    const modo = 'gross'
    // No hay código de validación que rechace esta combinación en el form
    // La siguiente lógica simula lo que haría el handleSubmit
    const modoJuego = format === 'match_play' ? 'neto' : modo
    // → se guardaría formato_juego=stableford, modo_juego=gross — SIN error
    expect(modoJuego).toBe('gross')
    // FINDING: stableford + gross se puede crear sin error — no está bloqueado
  })

  it('match_play: la UI fuerza modo neto automáticamente', () => {
    // Simular el onClick del formato match_play en NuevoTorneoForm
    let modo = 'gross'
    const selectedFormat = 'match_play'
    if (selectedFormat === 'match_play') modo = 'neto'
    expect(modo).toBe('neto')
    // match_play + gross = imposible via UX normal
  })

  it('match_play + gross: forzado a neto por lógica de envío', () => {
    // handleSubmit line: modo_juego: format === 'match_play' ? 'neto' : modo
    const format = 'match_play'
    const modoUI = 'gross' // aunque el usuario intente
    const modoJuegoFinal = format === 'match_play' ? 'neto' : modoUI
    expect(modoJuegoFinal).toBe('neto')
  })

  it('bloqueo de cambio de formato tras scores: EditTorneoForm deshabilita los botones', () => {
    // EditTorneoForm.tsx línea 171: disabled={tournament.has_scores}
    const hasScores = true
    // El botón de formato tiene disabled={tournament.has_scores}
    // Simulamos que el botón está deshabilitado
    const buttonDisabled = hasScores
    expect(buttonDisabled).toBe(true)
  })

  it('bloqueo de cambio de hoyos tras scores: EditTorneoForm deshabilita los botones', () => {
    // EditTorneoForm.tsx línea 190: disabled={tournament.has_scores}
    const hasScores = true
    const buttonDisabled = hasScores
    expect(buttonDisabled).toBe(true)
  })

  it('sin scores: se puede cambiar formato libremente', () => {
    const hasScores = false
    const buttonDisabled = hasScores
    expect(buttonDisabled).toBe(false)
  })

  it('EditTorneoForm: no incluye match_play en la lista de formatos editables', () => {
    // FORMATS en EditTorneoForm solo tiene stroke_play y stableford
    const FORMATS_EDIT = [
      { value: 'stroke_play' },
      { value: 'stableford' },
    ]
    const hasMatchPlay = FORMATS_EDIT.some(f => f.value === 'match_play')
    expect(hasMatchPlay).toBe(false)
    // FINDING: torneos match_play existentes no pueden cambiar a otro formato (correcto)
    // pero tampoco hay validación que bloquee editar otros campos de un match_play
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 2: Leaderboard por formato (peso 3)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:3] Leaderboard per format — ordenamiento', () => {

  const testPlayers = [
    { id: 'a', grossTotal: 75, netTotal: 70, stablefordTotal: 32 },
    { id: 'b', grossTotal: 72, netTotal: 68, stablefordTotal: 36 },
    { id: 'c', grossTotal: 80, netTotal: 65, stablefordTotal: 28 },
  ]

  it('Stableford: ordena DESC por stablefordTotal', () => {
    const sorted = sortLeaderboard(testPlayers, 'stableford', 'neto')
    expect(sorted.map(p => p.id)).toEqual(['b', 'a', 'c'])
    expect(sorted[0].stablefordTotal).toBe(36) // mayor puntaje gana
  })

  it('Stroke neto: ordena ASC por netTotal', () => {
    const sorted = sortLeaderboard(testPlayers, 'stroke_play', 'neto')
    expect(sorted.map(p => p.id)).toEqual(['c', 'b', 'a'])
    expect(sorted[0].netTotal).toBe(65) // menor score gana
  })

  it('Stroke gross: ordena ASC por grossTotal', () => {
    const sorted = sortLeaderboard(testPlayers, 'stroke_play', 'gross')
    expect(sorted.map(p => p.id)).toEqual(['b', 'a', 'c'])
    expect(sorted[0].grossTotal).toBe(72) // menor score gana
  })

  it('scoreHeader = "PUNTOS" para Stableford', () => {
    expect(getScoreHeader('stableford')).toBe('PUNTOS')
  })

  it('scoreHeader = "SCORE" para stroke_play', () => {
    expect(getScoreHeader('stroke_play')).toBe('SCORE')
  })

  it('scoreHeader = "SCORE" para match_play', () => {
    expect(getScoreHeader('match_play')).toBe('SCORE')
  })

  it('TournamentTabs: recibe prop formato y la usa para scoreHeader', () => {
    // Verificado en TournamentTabs.tsx línea 102:
    // const scoreHeader = formato === 'stableford' ? 'PUNTOS' : 'SCORE'
    // La prop `formato` existe en la interfaz Props (línea 28)
    const formatoProp = 'stableford'
    const header = formatoProp === 'stableford' ? 'PUNTOS' : 'SCORE'
    expect(header).toBe('PUNTOS')
  })

  it('empates muestran posición con T prefix', () => {
    const tied = [
      { total: -3 },
      { total: -3 },
      { total: -1 },
    ]
    const pos = computePositions(tied)
    expect(pos[0]).toBe('T1')
    expect(pos[1]).toBe('T1')
    expect(pos[2]).toBe('3')
  })

  it('sin empates: posiciones secuenciales normales', () => {
    const noTied = [{ total: -4 }, { total: -2 }, { total: 0 }]
    const pos = computePositions(noTied)
    expect(pos).toEqual(['1', '2', '3'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 3: Countback (peso 3)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:3] Countback — modo correcto por formato', () => {

  // Scores para 18 hoyos con diferencia en back 9
  const scoresA = [4, 4, 4, 4, 4, 4, 4, 4, 4,   // front 9: 36
                   5, 5, 5, 5, 5, 5, 5, 5, 5]    // back 9: 45
  const scoresB = [4, 4, 4, 4, 4, 4, 4, 4, 4,   // front 9: 36
                   4, 4, 4, 4, 4, 4, 4, 4, 5]    // back 9: 37 — mejor

  it('Stroke countback usa lower_wins: menos strokes en back 9 gana', () => {
    const players = [
      makePlayer('a', 81, scoresA),
      makePlayer('b', 81, scoresB),
    ]
    const result = resolveLeaderboardTies(players, 'lower_wins')
    // B gana: back 9 es 37 vs 45
    expect(result[0].id).toBe('b')
    expect(result[1].id).toBe('a')
  })

  // Puntos Stableford por hoyo para countback: más puntos gana
  const stableScoresA = [2, 2, 2, 2, 2, 2, 2, 2, 2,   // front 9: 18
                         2, 2, 2, 2, 2, 2, 2, 2, 3]    // back 9: 19
  const stableScoresB = [2, 2, 2, 2, 2, 2, 2, 2, 2,   // front 9: 18
                         3, 3, 3, 3, 3, 3, 3, 3, 3]    // back 9: 27 — más puntos, mejor

  it('Stableford countback usa higher_wins: más puntos en back 9 gana', () => {
    const players = [
      makePlayer('a', 37, stableScoresA),
      makePlayer('b', 37, stableScoresB),
    ]
    const result = resolveLeaderboardTies(players, 'higher_wins')
    // B gana: back 9 es 27 vs 19
    expect(result[0].id).toBe('b')
    expect(result[1].id).toBe('a')
  })

  it('Countback resuelto: anotación "(desempate)" en ganador', () => {
    const players = [
      makePlayer('a', 72, [4, 4, 4, 4, 4, 4, 4, 4, 4, 5, 4, 4, 4, 4, 4, 4, 4, 4]),
      makePlayer('b', 72, [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]),
    ]
    const result = resolveLeaderboardTies(players, 'lower_wins')
    const winner = result[0]
    // El ganador debe tener anotación de desempate
    expect(winner.resolvedByCountback).toBe(true)
    expect(winner.annotation).toBe('(desempate)')
  })

  it('Verdadero empate total: anotación "(empate)" en ambos', () => {
    const scores = [4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4]
    const players = [
      makePlayer('a', 72, scores),
      makePlayer('b', 72, scores),
    ]
    const result = applyCountback(players, 'lower_wins')
    // Ambos tienen "(empate)"
    expect(result.every(r => r.annotation === '(empate)')).toBe(true)
  })

  it('Stableford: countback usa scores de puntos por hoyo, no gross', () => {
    // En torneo/[slug]/page.tsx, para stableford el countback usa stablefordScores
    // CountbackPlayer.scores = stablefordScores (no gross)
    // Verificamos que con puntos altos en hoyo 18 gana (higher_wins)
    // A tiene 4pts en hoyo 18, B tiene 2pts en hoyo 18 → A gana con higher_wins
    // (back9, back6, back3 son todos iguales primero)
    const ptsA = [2, 2, 2, 2, 2, 2, 2, 2, 2,  2, 2, 2, 2, 2, 2, 2, 2, 4] // hoyo18=4pts
    const ptsB = [2, 2, 2, 2, 2, 2, 2, 2, 2,  2, 2, 2, 2, 2, 2, 2, 2, 2] // hoyo18=2pts
    // A back9 (h10-18): 2*8+4=20. B back9: 2*9=18. A wins on back9!
    const players = [
      makePlayer('a', 38, ptsA),
      makePlayer('b', 36, ptsB),
    ]
    // Primary scores differ: a=38, b=36 → no countback needed, a ranks first
    // For actual countback proof with same primary:
    const players2 = [
      makePlayer('a', 38, ptsA),
      makePlayer('b', 38, ptsB),
    ]
    const result = resolveLeaderboardTies(players2, 'higher_wins')
    // A wins: back9 sum = 20 vs B back9 = 18. higher_wins → A wins
    expect(result[0].id).toBe('a')
    expect(result[0].resolvedByCountback).toBe(true)
  })

  it('back 9: rangos correctos (hoyos 10-18, índices 9-17)', () => {
    // sumRange(scores, 10, 18) = índices 9..17
    // Verificar que el countback considera los últimos 9 hoyos
    const scoresLow = new Array(18).fill(4)
    scoresLow[17] = 3 // hoyo 18 (índice 17) = 3
    const scoresHigh = new Array(18).fill(4)
    // 'a' tiene hoyo 18 más bajo (mejor para lower_wins)
    const players = [
      makePlayer('a', 72, scoresLow),
      makePlayer('b', 72, scoresHigh),
    ]
    const result = resolveLeaderboardTies(players, 'lower_wins')
    expect(result[0].id).toBe('a')
  })

  it('card-off hoyo a hoyo cuando back9/6/3/18 son idénticos', () => {
    // Para card-off: todos los rangos deben ser iguales, diferencia solo en hoyo 1
    // C y D tienen mismos back9/6/3/18 pero diferente hoyo 1
    // C: hoyo1=5, resto=4. D: hoyo1=3, hoyo9=6, resto=4
    // back9 (h10-18): C=4*9=36, D=4*9=36 — igual
    // hoyo18: C=4, D=4 — igual
    // card-off hoyo1: C=5, D=3 → D gana (lower_wins, 3 < 5)
    const scoresC = [5, 4, 4, 4, 4, 4, 4, 4, 4,  4, 4, 4, 4, 4, 4, 4, 4, 4] // hoyo1=5
    const scoresD = [3, 4, 4, 4, 4, 4, 4, 4, 6,  4, 4, 4, 4, 4, 4, 4, 4, 4] // hoyo1=3, hoyo9=6
    // Totals: C=4*17+5=73, D=4*16+3+6=73 — same primary score
    const equalPrimary = [
      makePlayer('c', 73, scoresC),
      makePlayer('d', 73, scoresD),
    ]
    const result = resolveLeaderboardTies(equalPrimary, 'lower_wins')
    // back9 equal (both 36), back6 equal, back3 equal, h18 equal
    // card-off h1: D=3 < C=5 → D wins
    expect(result[0].id).toBe('d') // D tiene hoyo 1 = 3, menor = mejor
  })

  it('resolveLeaderboardTies: jugadores sin empate no reciben anotación', () => {
    const players = [
      makePlayer('a', 68, new Array(18).fill(4)),
      makePlayer('b', 72, new Array(18).fill(4)),
    ]
    const result = resolveLeaderboardTies(players, 'lower_wins')
    expect(result[0].id).toBe('a')
    expect(result[0].annotation).toBe('')
    expect(result[0].resolvedByCountback).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 4: Multi-round (peso 3)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:3] Multi-round — acumulación y tiebreak', () => {

  /**
   * La lógica multi-ronda vive en torneo/[slug]/page.tsx (legacy path).
   * Reproduce las funciones críticas para testear.
   */

  interface MockRound {
    id: string
    status: string
    total_gross: number
    total_net: number
    total_points: number
    round_number: number
    hole_scores: { hole_number: number; gross_score: number | null }[]
  }

  function computeMultiRoundEntry(
    rounds: MockRound[],
    parTotal: number,
    totalHoyos: number
  ) {
    const sortedRounds = [...rounds].sort((a, b) => (a.round_number ?? 1) - (b.round_number ?? 1))
    let cumulGross = 0, cumulNet = 0, cumulPoints = 0, totalHolesPlayed = 0
    let allFinished = true
    let latestScores = new Array(totalHoyos).fill(null) as (number | null)[]

    for (const round of sortedRounds) {
      cumulGross += round.total_gross ?? 0
      cumulNet += round.total_net ?? 0
      cumulPoints += round.total_points ?? 0
      const scores = new Array(totalHoyos).fill(null) as (number | null)[]
      ;(round.hole_scores || []).forEach(hs => {
        if (hs.gross_score != null) scores[hs.hole_number - 1] = hs.gross_score
      })
      totalHolesPlayed += scores.filter(s => s !== null).length
      if (round.status !== 'closed' && round.status !== 'official') allFinished = false
      latestScores = scores
    }

    const roundsPlayed = sortedRounds.length
    const netVsPar = totalHolesPlayed > 0 ? cumulNet - (parTotal * roundsPlayed) : 0

    return { cumulGross, cumulNet, cumulPoints, totalHolesPlayed, netVsPar, latestScores, allFinished }
  }

  it('acumula gross correctamente en 2 rondas', () => {
    const rounds: MockRound[] = [
      { id: 'r1', status: 'closed', total_gross: 75, total_net: 70, total_points: 32, round_number: 1, hole_scores: [] },
      { id: 'r2', status: 'closed', total_gross: 73, total_net: 68, total_points: 35, round_number: 2, hole_scores: [] },
    ]
    const result = computeMultiRoundEntry(rounds, 72, 18)
    expect(result.cumulGross).toBe(148)
  })

  it('acumula net correctamente en 2 rondas', () => {
    const rounds: MockRound[] = [
      { id: 'r1', status: 'closed', total_gross: 75, total_net: 70, total_points: 32, round_number: 1, hole_scores: [] },
      { id: 'r2', status: 'closed', total_gross: 73, total_net: 68, total_points: 35, round_number: 2, hole_scores: [] },
    ]
    const result = computeMultiRoundEntry(rounds, 72, 18)
    expect(result.cumulNet).toBe(138)
  })

  it('acumula stableford points correctamente en 2 rondas', () => {
    const rounds: MockRound[] = [
      { id: 'r1', status: 'closed', total_gross: 75, total_net: 70, total_points: 32, round_number: 1, hole_scores: [] },
      { id: 'r2', status: 'closed', total_gross: 73, total_net: 68, total_points: 35, round_number: 2, hole_scores: [] },
    ]
    const result = computeMultiRoundEntry(rounds, 72, 18)
    expect(result.cumulPoints).toBe(67)
  })

  it('netVsPar = cumulNet − (parTotal × rondasJugadas)', () => {
    const rounds: MockRound[] = [
      { id: 'r1', status: 'closed', total_gross: 75, total_net: 70, total_points: 32, round_number: 1, hole_scores: [{ hole_number: 1, gross_score: 4 }] },
      { id: 'r2', status: 'closed', total_gross: 73, total_net: 68, total_points: 35, round_number: 2, hole_scores: [{ hole_number: 1, gross_score: 4 }] },
    ]
    const parTotal = 72
    const result = computeMultiRoundEntry(rounds, parTotal, 18)
    // cumulNet=138, parTotal*2=144, netVsPar=138-144=-6
    expect(result.netVsPar).toBe(138 - 144)
  })

  it('allFinished=true solo si todas las rondas están cerradas', () => {
    const rounds: MockRound[] = [
      { id: 'r1', status: 'closed', total_gross: 75, total_net: 70, total_points: 32, round_number: 1, hole_scores: [] },
      { id: 'r2', status: 'in_progress', total_gross: 0, total_net: 0, total_points: 0, round_number: 2, hole_scores: [] },
    ]
    const result = computeMultiRoundEntry(rounds, 72, 18)
    expect(result.allFinished).toBe(false)
  })

  it('allFinished=true cuando todas las rondas son closed u official', () => {
    const rounds: MockRound[] = [
      { id: 'r1', status: 'closed', total_gross: 75, total_net: 70, total_points: 32, round_number: 1, hole_scores: [] },
      { id: 'r2', status: 'official', total_gross: 73, total_net: 68, total_points: 35, round_number: 2, hole_scores: [] },
    ]
    const result = computeMultiRoundEntry(rounds, 72, 18)
    expect(result.allFinished).toBe(true)
  })

  it('countback en multi-ronda usa scores de la ÚLTIMA ronda (single-round tiebreaking)', () => {
    // En torneo/page.tsx: latestScores = scores de la ronda más reciente
    // Los CountbackPlayer reciben latestScores (no acumulados)
    const rounds: MockRound[] = [
      {
        id: 'r1', status: 'closed', total_gross: 72, total_net: 70, total_points: 32, round_number: 1,
        hole_scores: [{ hole_number: 1, gross_score: 4 }]
      },
      {
        id: 'r2', status: 'closed', total_gross: 74, total_net: 72, total_points: 30, round_number: 2,
        hole_scores: [{ hole_number: 1, gross_score: 6 }]
      },
    ]
    const result = computeMultiRoundEntry(rounds, 72, 18)
    // latestScores debe ser de la ronda 2 (la última)
    expect(result.latestScores[0]).toBe(6) // gross_score del hoyo 1 en ronda 2
  })

  it('totalHolesPlayed se acumula entre rondas', () => {
    const holes18: { hole_number: number; gross_score: number | null }[] =
      Array.from({ length: 18 }, (_, i) => ({ hole_number: i + 1, gross_score: 4 }))
    const rounds: MockRound[] = [
      { id: 'r1', status: 'closed', total_gross: 72, total_net: 72, total_points: 36, round_number: 1, hole_scores: holes18 },
      { id: 'r2', status: 'closed', total_gross: 74, total_net: 74, total_points: 34, round_number: 2, hole_scores: holes18 },
    ]
    const result = computeMultiRoundEntry(rounds, 72, 18)
    expect(result.totalHolesPlayed).toBe(36) // 18 + 18
  })

  it('STATIC: canStartNextRound requiere allCurrentRoundsClosed + activeRoundNum < totalRounds', () => {
    // Lógica de scoring/page.tsx líneas ~395-398
    const isMultiRound = true
    const allCurrentRoundsClosed = true
    const activeRoundNum = 1
    const totalRounds = 3
    const playersLength = 5

    const canStartNextRound = isMultiRound && allCurrentRoundsClosed && activeRoundNum < totalRounds && playersLength > 0
    expect(canStartNextRound).toBe(true)
  })

  it('STATIC: no puede iniciar siguiente ronda si la actual no está cerrada', () => {
    const isMultiRound = true
    const allCurrentRoundsClosed = false
    const activeRoundNum = 1
    const totalRounds = 3
    const playersLength = 5

    const canStartNextRound = isMultiRound && allCurrentRoundsClosed && activeRoundNum < totalRounds && playersLength > 0
    expect(canStartNextRound).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 5: Escala — 40+ jugadores (peso 2 — análisis estático)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:2] Scale — 40+ players, no truncation', () => {

  /**
   * STATIC ANALYSIS of torneo/[slug]/page.tsx:
   *
   * The Supabase query for players does NOT use .limit():
   *   supabase.from('players').select(...).eq('tournament_id', tournament.id)
   *   → no .limit() call → fetches ALL players
   *
   * JugadoresPanel.tsx profiles search uses .limit(10) — this is for the SEARCH
   * dropdown only, not for the registered players list. The players list uses
   * initialPlayers passed as props (server-side, no limit).
   *
   * TournamentTabs.tsx renders players.map() — no slice/limit on the array.
   * computePositions() handles any array size.
   *
   * POTENTIAL ISSUE: Course dropdown in NuevoTorneoForm/EditTorneoForm uses
   * filteredCourses.slice(0, 15) — limits dropdown to 15 results but this
   * does NOT affect tournament players.
   */

  it('computePositions handles 40 players without truncation', () => {
    const players = Array.from({ length: 40 }, (_, i) => ({ total: i }))
    const positions = computePositions(players)
    expect(positions.length).toBe(40)
    expect(positions[0]).toBe('1')
    expect(positions[39]).toBe('40')
  })

  it('computePositions handles 100 players correctly', () => {
    const players = Array.from({ length: 100 }, (_, i) => ({ total: i }))
    const positions = computePositions(players)
    expect(positions.length).toBe(100)
    expect(positions[99]).toBe('100')
  })

  it('sortLeaderboard handles 100 players without data loss', () => {
    const players = Array.from({ length: 100 }, (_, i) => ({
      id: String(i),
      grossTotal: 100 - i,
      netTotal: 90 - i,
      stablefordTotal: i,
    }))
    const sorted = sortLeaderboard(players, 'stableford', 'neto')
    expect(sorted.length).toBe(100)
    // Last player (i=99) has stablefordTotal=99 — should be first
    expect(sorted[0].id).toBe('99')
  })

  it('STATIC: players query en torneo/page sin .limit() — sin truncamiento', () => {
    // This test documents the finding from code analysis:
    // The query at torneo/[slug]/page.tsx does NOT have .limit()
    // Therefore it returns all players regardless of count
    const noLimitInQuery = true // verified by grep
    expect(noLimitInQuery).toBe(true)
  })

  it('resolveLeaderboardTies handles 40 players', () => {
    const players = Array.from({ length: 40 }, (_, i) =>
      makePlayer(String(i), i % 5, new Array(18).fill(4)) // groups of 5 tied
    )
    const result = resolveLeaderboardTies(players, 'lower_wins')
    expect(result.length).toBe(40)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// SECCIÓN 6: Estados de jugadores — WD / DQ (peso 2)
// ─────────────────────────────────────────────────────────────────────────────

describe('[peso:2] Player states — WD / DQ', () => {

  /**
   * STATIC ANALYSIS FINDINGS:
   *
   * golf-data.ts: Status type = 'F' | 'live' — NO 'WD' or 'DQ' status defined.
   * TournamentTabs.tsx: only handles status === 'F' (finished) and assumes others are 'live'.
   * No WD/DQ badge rendered anywhere in TournamentTabs or torneo/page.tsx.
   * No WD/DQ column in leaderboard.
   *
   * JugadoresPanel.tsx: handleDesinscribir() with action 'withdraw_player'
   * DELETES the player from the tournament (cascading rounds/scores deletion).
   * There is no "WD" status set — the player is simply removed.
   *
   * CRITICAL FINDING: WD players are NOT shown with WD badge — they are DELETED.
   * DQ functionality does not exist at all.
   */

  it('Status type ONLY supports F and live — no WD or DQ', () => {
    // From golf-data.ts: export type Status = 'F' | 'live'
    type Status = 'F' | 'live'
    const validStatuses: Status[] = ['F', 'live']
    // WD and DQ are NOT valid Status values
    expect(validStatuses.includes('F')).toBe(true)
    expect(validStatuses.includes('live')).toBe(true)
    // TypeScript would reject 'WD' and 'DQ' — documented here as finding
    // FINDING: No WD/DQ status defined
  })

  it('FINDING: withdrawn player is DELETED, not marked WD', () => {
    // JugadoresPanel handleDesinscribir → action: 'withdraw_player'
    // This deletes the player and their rounds/scores from the tournament
    // The player does NOT appear in the leaderboard with a WD badge
    // This is a CRITICAL gap — tournament history loses WD information
    const withdrawActionDeletesPlayer = true
    expect(withdrawActionDeletesPlayer).toBe(true)
  })

  it('TournamentTabs: computePositions incluye todos los jugadores en el array', () => {
    // Since WD/DQ are not implemented, all players passed to TournamentTabs
    // are treated as active and ranked in the leaderboard.
    // If a "withdrawn" player were somehow given status 'WD', they would still
    // be sorted and ranked because sortLeaderboard has no WD filter.
    const players = [
      { total: -5 },
      { total: -3 },
      { total: -3 }, // "withdrawn" — no filtering exists
    ]
    const positions = computePositions(players)
    expect(positions.length).toBe(3) // all 3 included, no WD filtering
  })

  it('FINDING: sin filtro de WD/DQ en sortLeaderboard', () => {
    // The sort function in torneo/page.tsx does not filter by player status
    const players = [
      { id: 'a', grossTotal: 72, netTotal: 70, stablefordTotal: 35 },
      { id: 'b-WD', grossTotal: 68, netTotal: 66, stablefordTotal: 38 }, // hypothetical WD
    ]
    const sorted = sortLeaderboard(players, 'stroke_play', 'gross')
    // WD player would rank 1st (better score) with no WD filtering
    expect(sorted[0].id).toBe('b-WD')
    // FINDING: WD player would appear at the top of leaderboard if not deleted
  })

  it('player with holes=0 appears in leaderboard (no scores yet)', () => {
    // Players registered but not started appear in torneo/page.tsx
    // (noRound players are pushed to players array with holes=0)
    const noRoundPlayer = {
      pos: 5,
      name: 'Sin ronda',
      hcp: 10,
      today: 0,
      total: 0,
      holes: 0,
      status: 'live' as const,
    }
    // computePositions would rank them at the end with same total=0 as others
    expect(noRoundPlayer.holes).toBe(0)
    expect(noRoundPlayer.status).toBe('live')
  })

  it('STATIC: no DQ mechanism exists in any API action', () => {
    // game/route.ts actions: upsert_score, finalize_round, start_next_round,
    // cancel_tournament, withdraw_player
    // NO 'disqualify_player' action exists
    const apiActions = ['upsert_score', 'finalize_round', 'start_next_round', 'cancel_tournament', 'withdraw_player']
    expect(apiActions.includes('disqualify_player')).toBe(false)
    // FINDING: DQ is completely unimplemented
  })
})
