// @vitest-environment jsdom
// Hunter 23-oct-2026: una ronda FINALIZADA el día anterior mostraba en "Momentos recientes"
// "ahora", "hace 1 min", "hace 2 min". No era una hora: era el índice de la fila (0, 1, 2…).
// Los golpes no guardan cuándo se anotaron, así que no hay hora honesta que mostrar por evento.
// Contrato: el timeline muestra hoyo y golpes de cada momento, y ninguna hora inventada.
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { RecentTimeline } from './RecentTimeline'
import { buildTimelineEvents } from '@/lib/ronda/helpers'
import type { RondaLibre } from '@/types/ronda'

const parMap = { 1: 4, 2: 4, 3: 5, 4: 3, 5: 4, 6: 4, 7: 3, 8: 4, 9: 5 }
const siMap = { 1: 7, 2: 6, 3: 1, 4: 9, 5: 4, 6: 2, 7: 8, 8: 3, 9: 5 }
const jugadores = [
  { id: 'j1', nombre: 'E2E Test', user_id: 'u1', handicap: 15, tees: 'blanco', scores: { 1: 5, 2: 5, 3: 6, 4: 4, 5: 5, 6: 5, 7: 4, 8: 5, 9: 5 } },
  { id: 'j2', nombre: 'Inv Uno', user_id: null, handicap: null, tees: 'blanco', scores: { 1: 5, 2: 4, 3: 5, 4: 3, 5: 4, 6: 5, 7: 3, 8: 4, 9: 5 } },
  { id: 'j3', nombre: 'Inv Tres', user_id: null, handicap: null, tees: 'blanco', scores: { 1: 4, 2: 4, 3: 5, 4: 3, 5: 4, 6: 4, 7: 3, 8: 4, 9: 5 } },
]
const ronda = {
  id: 'r1', codigo: 'T2R1V3', course_name: 'Prince of Wales', course_id: 'c1', tees: 'blanco', holes: 9, hoyo_inicio: 1,
  fecha: '2026-10-22', estado: 'finalizada', modo_juego: 'gross', formato_juego: 'stableford', ronda_libre_jugadores: jugadores,
} as unknown as RondaLibre

const pintar = (isFinished: boolean) => render(
  <RecentTimeline
    ronda={ronda}
    timelineEvents={buildTimelineEvents(jugadores as never, 9, parMap)}
    parMap={parMap}
    siMap={siMap}
    courseHcpMap={{ j1: 9, j2: 0, j3: 0 }}
    isFinished={isFinished}
    timeSinceUpdate="hace 14 h"
  />,
)

describe('RecentTimeline — sin horas inventadas por evento', () => {
  it('una ronda finalizada muestra hoyo y golpes de cada momento, nunca "ahora" ni "hace N min"', () => {
    pintar(true)
    expect(screen.getAllByText('Hoyo 9 · 5 golpes')).toHaveLength(3)
    expect(screen.queryByText(/^ahora$/i)).toBeNull()
    expect(screen.queryByText(/hace \d+ min/i)).toBeNull()
    // Finalizada: tampoco se muestra la hora del último guardado.
    expect(screen.queryByText('hace 14 h')).toBeNull()
  })

  it('en vivo, la única hora es la real del último guardado, en el encabezado', () => {
    pintar(false)
    expect(screen.getByText('hace 14 h')).toBeTruthy()
    expect(screen.queryByText(/^ahora$/i)).toBeNull()
    expect(screen.queryByText(/hace \d+ min/i)).toBeNull()
  })
})
