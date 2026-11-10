// Inscripción masiva del organizador: "Juan, +2" es un plus (se guarda −2), como en el resto de la app.
// Con Number("+2") se inscribía con 2: cuatro golpes de diferencia en el neto.
import { describe, it, expect } from 'vitest'
import { parseBatchLine } from '../InscribirPlayerForm'

describe('parseBatchLine — hándicap plus', () => {
  it('"+2" → −2; "-2" → −2; "12.4" → 12.4; sin número → null', () => {
    expect(parseBatchLine('Juan Pérez, +2')).toEqual({ name: 'Juan Pérez', hcp: -2 })
    expect(parseBatchLine('Juan Pérez; -2')).toEqual({ name: 'Juan Pérez', hcp: -2 })
    expect(parseBatchLine('Ana\t12.4')).toEqual({ name: 'Ana', hcp: 12.4 })
    expect(parseBatchLine('Ana, sin hcp')).toEqual({ name: 'Ana', hcp: null })
  })
  it('"+0" es 0, no −0', () => {
    expect(Object.is(parseBatchLine('Ana, +0')!.hcp, 0)).toBe(true)
  })
})
