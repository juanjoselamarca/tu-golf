// Inscripción masiva del organizador. El hándicap se saca del FINAL de la línea, antes de partir por comas:
// "Juan Pérez, 18,5" quedaba en 18 (Excel chileno usa coma decimal). "+2" es un plus (se guarda −2).
import { describe, it, expect } from 'vitest'
import { parseBatchLine } from '../InscribirPlayerForm'

describe('parseBatchLine', () => {
  it.each([
    ['Juan Pérez, 18,5', 'Juan Pérez', 18.5],
    ['Juan\t18,5', 'Juan', 18.5],
    ['Juan Pérez 18,5', 'Juan Pérez', 18.5],
    ['Juan Pérez; 18,5', 'Juan Pérez', 18.5],
  ])('coma decimal: %j → %s, %s', (linea, name, hcp) => {
    expect(parseBatchLine(linea)).toEqual({ name, hcp })
  })

  it.each([
    ['Juan Pérez, +2', 'Juan Pérez', -2],
    ['Juan Pérez; -2', 'Juan Pérez', -2],
    ['Ana\t12.4', 'Ana', 12.4],
    ['Ana, 12.4', 'Ana', 12.4],
    ['Ana, ana@x.com, 18.4', 'Ana', 18.4],
    ['Ana', 'Ana', null],
    ['Ana, sin hcp', 'Ana', null],
    ['  Ana Soto  ', 'Ana Soto', null],
  ])('formatos que ya funcionaban: %j → %s, %s', (linea, name, hcp) => {
    expect(parseBatchLine(linea)).toEqual({ name, hcp })
  })

  it('"+0" es 0, no −0; línea vacía o sin nombre → null', () => {
    expect(Object.is(parseBatchLine('Ana, +0')!.hcp, 0)).toBe(true)
    expect(parseBatchLine('   ')).toBeNull()
    expect(parseBatchLine(', 12')).toBeNull()
  })
})
