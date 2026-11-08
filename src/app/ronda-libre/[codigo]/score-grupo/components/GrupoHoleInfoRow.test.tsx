import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GrupoHoleInfoRow } from './GrupoHoleInfoRow'
import { SCORER_THEME } from '@/components/ronda/scorer-theme'

function renderFila(yardaje: number | null, showNetStableford = false) {
  render(
    <GrupoHoleInfoRow
      par={4} strokeIndex={13} yardaje={yardaje}
      showNetStableford={showNetStableford} maxStrokes={1} theme={SCORER_THEME}
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

  // Mismo predicado que HoleInfoRow: el divisor va entre columnas y nunca
  // después de la última. Acá la columna GOLPES se dibuja aparte del map, así
  // que SI sí lleva borde cuando ella viene detrás.
  it('la última columna no deja el divisor colgando', () => {
    renderFila(null)
    expect(tieneDivisor('PAR')).toBe(true)
    expect(tieneDivisor('SI')).toBe(false)
  })

  it('con la columna GOLPES GRUPO detrás, SI mantiene su divisor', () => {
    renderFila(null, true)
    expect(tieneDivisor('SI')).toBe(true)
    expect(tieneDivisor('GOLPES GRUPO')).toBe(false)
  })

  // El número es el máximo del GRUPO, no los golpes del que mira: sin el "MÁX",
  // el que recibe 1 en un grupo donde otro recibe 2 leia "GOLPES +2" al lado de
  // PAR y SI —que sí son iguales para todos— y cree que la app se equivocó.
  it('la columna de golpes dice que el número es el máximo del grupo', () => {
    renderFila(null, true)
    expect(screen.queryByText('GOLPES')).toBeNull()
    expect(screen.getByText('GOLPES GRUPO')).toBeTruthy()
    expect(screen.getByText('+1')).toBeTruthy()
  })
})
