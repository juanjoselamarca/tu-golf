// 19-oct — Ronda de 9 que parte en el 10: la tarjeta expandida del jugador muestra los
// hoyos 10-18 que jugó (antes armaba 1-9 y salía vacía, con total 0).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IndividualLeaderboard } from './IndividualLeaderboard'
import { buildLeaderboard } from '@/lib/ronda/leaderboard'
import type { RondaLibre } from '@/types/ronda'
import { crearHcpAMostrar } from '@/lib/data/ronda-libre-live-api'

const back = (v: number) => Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 10, v]))
const parMap = back(4)
const siMap = Object.fromEntries(Array.from({ length: 9 }, (_, i) => [i + 10, 2 * i + 2]))
const jugadores = [{ id: 'j1', nombre: 'Alberto', user_id: null, handicap: 10, tees: null, scores: back(5) }]
const ronda = {
  id: 'r1', codigo: 'BACK9', course_name: 'Club de Polo', course_id: 'c1', tees: 'azul', holes: 9, hoyo_inicio: 10,
  fecha: '2026-10-19', estado: 'en_curso', modo_juego: 'gross', formato_juego: 'stroke_play', ronda_libre_jugadores: jugadores,
} as unknown as RondaLibre
const courseHcpMap = { j1: 5 }
const leaderboard = buildLeaderboard({
  jugadores: jugadores as never, holes: 9, hoyoInicio: 10, parMap, siMap, courseHcpMap, modoJuego: 'gross', formatoJuego: 'stroke_play',
})

describe('IndividualLeaderboard — 9 hoyos desde el 10', () => {
  it('la tarjeta expandida muestra los hoyos 10-18 con el total jugado', () => {
    render(
      <IndividualLeaderboard
        ronda={ronda} leaderboard={leaderboard} isNetoMode={false} hasCourse parMap={parMap} siMap={siMap}
        courseHcpMap={courseHcpMap} hcpAMostrar={crearHcpAMostrar(jugadores, { j1: 10 }, [], new Set())}
        fechaDisplay="19 oct" expanded="j1" onToggleExpand={() => {}}
      />,
    )
    expect(screen.getAllByText('18').length).toBeGreaterThan(0)
    expect(screen.getAllByText('45').length).toBeGreaterThan(0)
  })
})
