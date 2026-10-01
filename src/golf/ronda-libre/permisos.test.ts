import { describe, it, expect } from 'vitest'
import { puedeDescartarRonda } from './permisos'

describe('puedeDescartarRonda — espejo de descartar_ronda_libre (P0003)', () => {
  const ronda = { creador_id: 'u1', es_demo: false }
  it('sólo el creador con sesión', () => {
    expect(puedeDescartarRonda(ronda, 'u1')).toBe(true)
    expect(puedeDescartarRonda(ronda, 'u2')).toBe(false)
    expect(puedeDescartarRonda(ronda, null)).toBe(false)
    expect(puedeDescartarRonda(ronda, undefined)).toBe(false)
  })
  it('nunca una demo, nunca sin ronda o sin creador', () => {
    expect(puedeDescartarRonda({ ...ronda, es_demo: true }, 'u1')).toBe(false)
    expect(puedeDescartarRonda(null, 'u1')).toBe(false)
    expect(puedeDescartarRonda({ creador_id: null }, 'u1')).toBe(false)
    expect(puedeDescartarRonda({}, 'u1')).toBe(false)
  })
})
