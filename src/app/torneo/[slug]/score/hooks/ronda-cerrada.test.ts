import { describe, it, expect } from 'vitest'
import { avisoRondaCerrada, sondeoActivo } from './ronda-cerrada'

describe('avisoRondaCerrada (Fable #829: un WD con la ronda cerrada leía "aparece acá sola")', () => {
  it.each(['withdrawn', 'disqualified'])('%s → fuera, aunque haya 401', (status) => {
    expect(avisoRondaCerrada({ status, rondaSiguienteSinSesion: false })).toBe('fuera')
    expect(avisoRondaCerrada({ status, rondaSiguienteSinSesion: true })).toBe('fuera')
  })
  it('aprobado: sin sesión con la siguiente abierta → sin_sesion; si no, espera', () => {
    expect(avisoRondaCerrada({ status: 'approved', rondaSiguienteSinSesion: true })).toBe('sin_sesion')
    expect(avisoRondaCerrada({ status: 'approved', rondaSiguienteSinSesion: false })).toBe('espera')
  })
})

describe('sondeoActivo', () => {
  const base = { esperaRondaSiguiente: true, sinTarjeta: false, torneoInactivo: false, status: 'approved' }
  it('aprobado esperando la ronda siguiente → sondea', () => { expect(sondeoActivo(base)).toBe(true) })
  it('retirado o descalificado → deja de releer', () => {
    expect(sondeoActivo({ ...base, status: 'withdrawn' })).toBe(false)
    expect(sondeoActivo({ ...base, esperaRondaSiguiente: false, sinTarjeta: true, status: 'disqualified' })).toBe(false)
  })
  it('torneo inactivo o nada que esperar → no sondea', () => {
    expect(sondeoActivo({ ...base, torneoInactivo: true })).toBe(false)
    expect(sondeoActivo({ ...base, esperaRondaSiguiente: false })).toBe(false)
  })
})
