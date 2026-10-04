import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { InlineEditScores } from '../InlineEditScores'

describe('InlineEditScores', () => {
  it('ronda de 9 desde el 10: 9 casillas con el número real del hoyo y los estimados marcados', () => {
    render(
      <InlineEditScores
        initialScores={[4, 5, 4, 4, 4, 4, 4, 4, 4]}
        hoyos={[10, 11, 12, 13, 14, 15, 16, 17, 18]}
        estimados={[{ hoyo: 11 }]}
        saving={false} onSave={vi.fn()} onCancel={vi.fn()}
      />,
    )
    expect(screen.getAllByRole('textbox')).toHaveLength(9)
    const estimado = screen.getByLabelText('Golpes del hoyo 11 (estimado)') as HTMLInputElement
    expect(estimado.value).toBe('5')
    expect(estimado.style.border).toContain('dashed')
    expect(screen.getByLabelText('Golpes del hoyo 10')).toBeTruthy()
    expect(screen.getByText(/Borde punteado/)).toBeTruthy()
  })

  it('sin metadata (filas viejas): 18 casillas numeradas 1..18, sin leyenda', () => {
    render(<InlineEditScores initialScores={[]} saving={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(18)
    expect(screen.queryByText(/Borde punteado/)).toBeNull()
  })

  it('fila vieja de 9 (sin metadata.hoyos): 9 casillas, no 18', () => {
    render(<InlineEditScores initialScores={[4, 4, 4, 4, 4, 4, 4, 4, 4]} saving={false} onSave={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getAllByRole('textbox')).toHaveLength(9)
  })
})
