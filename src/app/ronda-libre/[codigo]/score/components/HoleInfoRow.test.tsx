import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HoleInfoRow } from './HoleInfoRow'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'

function renderFila(yardaje: number | null) {
  render(
    <HoleInfoRow
      par={4} strokeIndex={13} yardaje={yardaje}
      showStrokes={false} strokesOnHole={0} onShare={() => {}} theme={SCORER_THEME}
    />,
  )
}

describe('HoleInfoRow', () => {
  // Mismo criterio que GrupoHoleInfoRow: sin yardaje auditado no hay columna.
  it('sin yardaje auditado no dibuja la columna YDS', () => {
    renderFila(null)
    expect(screen.queryByText('YDS')).toBeNull()
    expect(screen.queryByText('—')).toBeNull()
    expect(screen.getByText('PAR')).toBeTruthy()
  })

  it('con yardaje auditado lo muestra', () => {
    renderFila(350)
    expect(screen.getByText('YDS')).toBeTruthy()
    expect(screen.getByText('350')).toBeTruthy()
  })
})
