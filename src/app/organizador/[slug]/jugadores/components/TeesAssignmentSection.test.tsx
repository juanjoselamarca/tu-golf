// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TeesAssignmentSection } from './TeesAssignmentSection'
import type { PlayerRow } from '@/lib/data/tournaments/players'
import type { CourseTeeRow } from '@/golf/courses/resolve-player-tee'

const players: PlayerRow[] = [
  {
    id: 'p1',
    tournament_id: 't1',
    user_id: 'u1',
    category_id: null,
    handicap_at_registration: 12.3,
    status: 'approved',
    tee_id: 't-azul',
    profiles: { id: 'u1', name: 'Juan Pérez', indice: 12.3 },
    categories: null,
  },
  {
    id: 'p2',
    tournament_id: 't1',
    user_id: 'u2',
    category_id: 'cat-damas',
    handicap_at_registration: 18.4,
    status: 'approved',
    tee_id: null,
    profiles: { id: 'u2', name: 'María González', indice: 18.4 },
    categories: { id: 'cat-damas', name: 'Damas', default_tee_color: 'Rojo', gender: 'female' },
  },
]

const courseTees: CourseTeeRow[] = [
  { id: 't-azul',   nombre: 'Azul',   rating: 70.3, slope: 129, yardaje_total: 6573 },
  { id: 't-rojo',   nombre: 'Rojo',   rating: 69.8, slope: 115, yardaje_total: 5240 },
  { id: 't-negras', nombre: 'Negras', rating: 73.8, slope: 140, yardaje_total: 6810 },
]

describe('TeesAssignmentSection', () => {
  it('renderea fila por jugador inscrito', () => {
    render(
      <TeesAssignmentSection
        players={players}
        courseTees={courseTees}
        tournamentTeesGlobal={null}
        loading={new Set()}
        errors={new Map()}
        onAssign={vi.fn()}
      />
    )
    expect(screen.getByText('Juan Pérez')).toBeTruthy()
    expect(screen.getByText('María González')).toBeTruthy()
  })

  it('jugador con tee_id muestra nombre del tee asignado', () => {
    render(
      <TeesAssignmentSection
        players={players}
        courseTees={courseTees}
        tournamentTeesGlobal={null}
        loading={new Set()}
        errors={new Map()}
        onAssign={vi.fn()}
      />
    )
    // Juan tiene tee_id=t-azul → muestra Azul (en el label visible)
    const azulMatches = screen.getAllByText('Azul')
    expect(azulMatches.length).toBeGreaterThan(0)
  })

  it('jugador sin tee_id pero con categoría → muestra tee heredado (Rojo)', () => {
    render(
      <TeesAssignmentSection
        players={players}
        courseTees={courseTees}
        tournamentTeesGlobal={null}
        loading={new Set()}
        errors={new Map()}
        onAssign={vi.fn()}
      />
    )
    // María category.default_tee_color='Rojo' → fila muestra Rojo
    const rojoMatches = screen.getAllByText('Rojo')
    expect(rojoMatches.length).toBeGreaterThan(0)
  })

  it('cambio de select dispara onAssign(playerId, teeId)', () => {
    const onAssign = vi.fn()
    render(
      <TeesAssignmentSection
        players={players}
        courseTees={courseTees}
        tournamentTeesGlobal={null}
        loading={new Set()}
        errors={new Map()}
        onAssign={onAssign}
      />
    )
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: 't-negras' } })
    expect(onAssign).toHaveBeenCalledWith('p1', 't-negras')
  })

  it('cambio a opción vacía dispara onAssign(playerId, null)', () => {
    const onAssign = vi.fn()
    render(
      <TeesAssignmentSection
        players={players}
        courseTees={courseTees}
        tournamentTeesGlobal={null}
        loading={new Set()}
        errors={new Map()}
        onAssign={onAssign}
      />
    )
    const selects = screen.getAllByRole('combobox')
    fireEvent.change(selects[0], { target: { value: '' } })
    expect(onAssign).toHaveBeenCalledWith('p1', null)
  })

  it('empty state cuando NO hay jugadores', () => {
    render(
      <TeesAssignmentSection
        players={[]}
        courseTees={courseTees}
        tournamentTeesGlobal={null}
        loading={new Set()}
        errors={new Map()}
        onAssign={vi.fn()}
      />
    )
    expect(screen.getByText(/Inscribí jugadores/)).toBeTruthy()
  })

  it('empty state cuando NO hay courseTees', () => {
    render(
      <TeesAssignmentSection
        players={players}
        courseTees={[]}
        tournamentTeesGlobal={null}
        loading={new Set()}
        errors={new Map()}
        onAssign={vi.fn()}
      />
    )
    expect(screen.getByText(/tees cargados/)).toBeTruthy()
  })

  it('filtra jugadores con status != approved (WD/DQ no aparecen)', () => {
    const playersConWD: PlayerRow[] = [
      ...players,
      { ...players[0], id: 'p3', status: 'withdrawn', profiles: { ...players[0].profiles!, name: 'Pedro Sale' } },
    ]
    render(
      <TeesAssignmentSection
        players={playersConWD}
        courseTees={courseTees}
        tournamentTeesGlobal={null}
        loading={new Set()}
        errors={new Map()}
        onAssign={vi.fn()}
      />
    )
    expect(screen.queryByText('Pedro Sale')).toBeNull()
  })
})
