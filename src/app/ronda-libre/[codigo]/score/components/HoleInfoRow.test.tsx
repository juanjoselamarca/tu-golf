import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { HoleInfoRow } from './HoleInfoRow'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'

function renderFila(yardaje: number | null, showStrokes = false) {
  render(
    <HoleInfoRow
      par={4} strokeIndex={13} yardaje={yardaje}
      showStrokes={showStrokes} strokesOnHole={1} onShare={() => {}} theme={SCORER_THEME}
    />,
  )
}

/**
 * Si la columna dibuja el divisor a su derecha. Se mira el shorthand y no
 * `borderRightStyle`: jsdom guarda `borderRight` tal cual se escribió y no lo
 * expande, así que la propiedad larga vuelve vacía en los dos casos.
 */
function tieneDivisor(label: string): boolean {
  const el = screen.getByText(label).parentElement
  expect(el, `no está la columna ${label}`).toBeTruthy()
  return (el as HTMLElement).style.borderRight.includes('solid')
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

  // El divisor separa columnas entre sí, nunca la última del botón de compartir:
  // con dos columnas (stroke play bruto sin yardaje, la ronda individual más
  // común) un borde incondicional dejaba una línea vertical flotando contra el
  // vacío. Mismo predicado que GrupoHoleInfoRow.
  it('la última columna no deja el divisor colgando', () => {
    renderFila(null)
    expect(tieneDivisor('PAR')).toBe(true)
    expect(tieneDivisor('SI')).toBe(false)
  })

  it('con tres columnas el divisor sigue yendo entre ellas', () => {
    renderFila(null, true)
    expect(tieneDivisor('PAR')).toBe(true)
    expect(tieneDivisor('SI')).toBe(true)
    expect(tieneDivisor('GOLPES')).toBe(false)
  })
})
