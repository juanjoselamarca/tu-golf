import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GrupoHoleInfoRow } from './GrupoHoleInfoRow'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'

function renderFila(yardaje: number | null) {
  render(
    <GrupoHoleInfoRow
      par={4} strokeIndex={13} yardaje={yardaje}
      showNetStableford={false} maxStrokes={0} theme={SCORER_THEME}
    />,
  )
}

describe('GrupoHoleInfoRow', () => {
  // El yardaje solo sale si la cancha tiene `yardaje_verificado_at`, y hoy no lo
  // tiene NINGUNA (0 de 3.249 hoyos en prod, 27-oct-2026): la columna mostraba
  // un "—" fijo a todos los jugadores y se comía un tercio de la fila.
  it('sin yardaje auditado no dibuja la columna YDS', () => {
    renderFila(null)
    expect(screen.queryByText('YDS')).toBeNull()
    expect(screen.queryByText('—')).toBeNull()
    expect(screen.getByText('PAR')).toBeTruthy()
    expect(screen.getByText('SI')).toBeTruthy()
  })

  it('con yardaje auditado lo muestra', () => {
    renderFila(350)
    expect(screen.getByText('YDS')).toBeTruthy()
    expect(screen.getByText('350')).toBeTruthy()
  })
})
