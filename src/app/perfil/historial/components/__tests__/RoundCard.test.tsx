/**
 * RoundCard — wiring del menú "..." a los callbacks de acción.
 * Regresión del reporte "los botones no hacen nada": confirma que abrir el
 * menú y tocar Excluir / Eliminar→confirmar dispara los handlers.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { RoundCard } from '../RoundCard'
import type { HistoricalRound } from '../../lib/types'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const round: HistoricalRound = {
  id: 'r1', course_name: 'Los Leones', course_id: null, tee_color: null,
  played_at: '2026-06-01', scores: [4, 4, 4, 4, 4, 4, 4, 4, 4],
  total_gross: 36, holes_played: 9, notes: null, privacy: 'private',
  created_at: '2026-06-01', excluded_from_handicap: false,
}

function setup() {
  const onToggleExcluded = vi.fn()
  const onDeleteRound = vi.fn()
  const onStartEdit = vi.fn()
  render(
    <RoundCard
      round={round} isExpanded={false} isEditing={false} isLast
      deleting={false} savingEdit={false}
      onToggleExpand={vi.fn()} onStartEdit={onStartEdit} onCancelEdit={vi.fn()} onSaveEdit={vi.fn()}
      onToggleExcluded={onToggleExcluded} onDeleteRound={onDeleteRound}
    />,
  )
  return { onToggleExcluded, onDeleteRound, onStartEdit }
}

describe('RoundCard — menú de acciones', () => {
  it('abre el menú al tocar "..."', async () => {
    const user = userEvent.setup()
    setup()
    await user.click(screen.getByLabelText('Opciones de la tarjeta'))
    expect(screen.getByTestId('historial-menu-toggle-excluded')).toBeTruthy()
    expect(screen.getByTestId('historial-menu-eliminar')).toBeTruthy()
  })

  it('Excluir del índice → llama onToggleExcluded', async () => {
    const user = userEvent.setup()
    const { onToggleExcluded } = setup()
    await user.click(screen.getByLabelText('Opciones de la tarjeta'))
    await user.click(screen.getByTestId('historial-menu-toggle-excluded'))
    expect(onToggleExcluded).toHaveBeenCalledTimes(1)
  })

  it('Eliminar → confirmar → llama onDeleteRound', async () => {
    const user = userEvent.setup()
    const { onDeleteRound } = setup()
    await user.click(screen.getByLabelText('Opciones de la tarjeta'))
    await user.click(screen.getByTestId('historial-menu-eliminar'))
    await user.click(screen.getByTestId('historial-confirm-delete-confirm'))
    expect(onDeleteRound).toHaveBeenCalledTimes(1)
  })

  // Bug inbox 7ef9ebdb: "Editar" del menú no hacía nada salvo que la tarjeta ya
  // estuviera expandida. Editar debe disparar onStartEdit aunque isExpanded=false.
  it('Editar → llama onStartEdit sin necesidad de expandir antes', async () => {
    const user = userEvent.setup()
    const { onStartEdit } = setup()
    await user.click(screen.getByLabelText('Opciones de la tarjeta'))
    await user.click(screen.getByTestId('historial-menu-editar'))
    expect(onStartEdit).toHaveBeenCalledTimes(1)
  })

  // Guard estructural del fix de stacking: el menú se renderiza vía portal en
  // document.body (fuera de la tarjeta con transform + overflow:hidden), no como
  // descendiente del RoundCard. Si alguien revierte el portal, esto falla.
  it('el menú se renderiza en un portal a document.body (fuera de la card)', async () => {
    const user = userEvent.setup()
    const { container } = renderCard()
    await user.click(screen.getByLabelText('Opciones de la tarjeta'))
    const menuItem = screen.getByTestId('historial-menu-editar')
    // El ítem existe en el documento…
    expect(menuItem).toBeTruthy()
    // …pero NO como descendiente del árbol del RoundCard.
    expect(container.contains(menuItem)).toBe(false)
  })

  // El ConfirmDeleteSheet (position:fixed inset:0) también debe portalearse:
  // dentro de .card-animate su inset:0 mapea a la card, no al viewport → salía
  // como tira en vez de bottom-sheet full-screen desde una card colapsada.
  it('el sheet de confirmación se renderiza en un portal (fuera de la card)', async () => {
    const user = userEvent.setup()
    const { container } = renderCard()
    await user.click(screen.getByLabelText('Opciones de la tarjeta'))
    await user.click(screen.getByTestId('historial-menu-eliminar'))
    const sheet = screen.getByTestId('historial-confirm-delete-sheet')
    expect(sheet).toBeTruthy()
    expect(container.contains(sheet)).toBe(false)
  })
})

function renderCard() {
  return render(
    <RoundCard
      round={round} isExpanded={false} isEditing={false} isLast
      deleting={false} savingEdit={false}
      onToggleExpand={vi.fn()} onStartEdit={vi.fn()} onCancelEdit={vi.fn()} onSaveEdit={vi.fn()}
      onToggleExcluded={vi.fn()} onDeleteRound={vi.fn()}
    />,
  )
}
