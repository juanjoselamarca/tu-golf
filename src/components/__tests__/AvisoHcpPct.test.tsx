/**
 * Aviso del handicap de juego del torneo en la cabecera del board público.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { AvisoHcpPct } from '@/components/AvisoHcpPct'

afterEach(cleanup)

describe('AvisoHcpPct', () => {
  it('pinta la etiqueta con el token de texto secundario (contraste AA medido)', () => {
    render(<AvisoHcpPct etiqueta="Handicap al 85 %" />)
    const aviso = screen.getByText('Handicap al 85 %')
    expect(aviso.style.color).toBe('var(--text-2)')
  })

  it('sin etiqueta (torneo al 100 %) no pinta nada', () => {
    const { container } = render(<AvisoHcpPct etiqueta={null} />)
    expect(container.innerHTML).toBe('')
  })
})
