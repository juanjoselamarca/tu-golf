// Regresión: el course handicap COMPLETO (18h) viaja como Player.hcpDisplay,
// separado del de SCORING (Player.hcp, 9h en rondas de 9h).
//
// Bug de campo (28-jun-2026, inbox): el board de torneo mostraba el handicap
// partido a la mitad en torneos de 9 hoyos. El fix resuelve `handicap_display`
// (18h) en la capa de datos y lo threadea hasta la columna HCP, dejando
// `handicap` (9h) intacto para el neto/stableford.

import { describe, it, expect } from 'vitest'
import { buildLeaderboardFromRondaLibre } from './build-from-ronda-libre'
import type { TournamentLeaderboardContext } from './types'
import type { DBRondaLibreJugador } from '@/app/torneo/[slug]/types'

const courseHoles9 = Array.from({ length: 9 }, (_, i) => ({
  numero: i + 1,
  par: 4,
  stroke_index: i + 1,
}))

const ctx: TournamentLeaderboardContext = {
  parTotal: 36,
  totalHoyos: 9,
  modoJuego: 'neto',
  formatoJuego: 'stroke_play',
  courseHoles: courseHoles9,
}

function jugador(over: Partial<DBRondaLibreJugador>): DBRondaLibreJugador {
  return {
    id: 'j1',
    nombre: 'Matías',
    user_id: null,
    scores: { '1': 5, '2': 4, '3': 5, '4': 4, '5': 5, '6': 4, '7': 5, '8': 4, '9': 5 },
    handicap: 8,
    handicap_index: 11,
    tees: 'azul',
    ronda_id: 'r1',
    ...over,
  }
}

describe('buildLeaderboardFromRondaLibre — hcpDisplay (18h) separado de hcp (9h)', () => {
  it('una ronda de 9h: hcp = scoring (9h), hcpDisplay = completo (18h)', () => {
    const { players } = buildLeaderboardFromRondaLibre([jugador({ handicap: 8, handicap_display: 15 })], ctx)
    expect(players).toHaveLength(1)
    expect(players[0].hcp).toBe(8)        // scoring 9h — intacto
    expect(players[0].hcpDisplay).toBe(15) // completo 18h — el que se muestra
  })

  it('sin handicap_display (ronda de 18h / fetch plano): hcpDisplay cae a hcp', () => {
    const { players } = buildLeaderboardFromRondaLibre([jugador({ handicap: 12, handicap_display: undefined })], ctx)
    expect(players[0].hcp).toBe(12)
    expect(players[0].hcpDisplay).toBe(12)
  })

  it('el neto NO cambia por el display: usa el handicap de scoring (9h)', () => {
    // Mismo scoring handicap (8), distinto display (15 vs ausente) → mismo neto.
    const conDisplay = buildLeaderboardFromRondaLibre([jugador({ handicap: 8, handicap_display: 15 })], ctx).players[0]
    const sinDisplay = buildLeaderboardFromRondaLibre([jugador({ handicap: 8, handicap_display: undefined })], ctx).players[0]
    expect(conDisplay.total).toBe(sinDisplay.total) // vsPar neto idéntico
  })
})
