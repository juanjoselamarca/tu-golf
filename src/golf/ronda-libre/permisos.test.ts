import { describe, it, expect } from 'vitest'
import { esMiTarjeta, puedeDescartarRonda } from './permisos'

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

describe('esMiTarjeta — fuente única de "es mi tarjeta" (finalizadores y máscara del GWI)', () => {
  it('sólo con el mismo user_id no vacío', () => {
    expect(esMiTarjeta({ user_id: 'u1' }, 'u1')).toBe(true)
    expect(esMiTarjeta({ user_id: 'u2' }, 'u1')).toBe(false)
  })
  it('user_id vacío, null o ausente nunca es propia (ni con visor vacío)', () => {
    expect(esMiTarjeta({ user_id: '' }, '')).toBe(false)
    expect(esMiTarjeta({ user_id: '' }, 'u1')).toBe(false)
    expect(esMiTarjeta({ user_id: 'u1' }, '')).toBe(false)
    expect(esMiTarjeta({ user_id: null }, null)).toBe(false)
    expect(esMiTarjeta({}, undefined)).toBe(false)
    expect(esMiTarjeta(null, 'u1')).toBe(false)
  })
})
