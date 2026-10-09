import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import LiveFilterBar from './LiveFilterBar'

const base = {
  groups: [{ id: 'g1', name: 'Grupo 1' }], selectedCategory: null, selectedGroup: null,
  myViewEnabled: false, canEnableMyView: false,
  onCategoryChange: vi.fn(), onGroupChange: vi.fn(), onMyViewToggle: vi.fn(), onTVMode: vi.fn(),
}

describe('LiveFilterBar — filtro de categoría', () => {
  it('sin categorías con jugadores (camino de ronda libre): no se ofrece (sólo vaciaría el board)', () => {
    render(<LiveFilterBar {...base} categories={[]} />)
    expect(screen.queryByLabelText('Categoría')).toBeNull()
    expect(screen.getByLabelText('Grupo')).toBeTruthy()
  })
  it('con categorías: se ofrece', () => {
    render(<LiveFilterBar {...base} categories={[{ id: 'c1', name: 'Damas' }]} />)
    expect(screen.getByLabelText('Categoría')).toBeTruthy()
  })
})
