/** El rechazo de golpes de un equipo terminado (trigger de la migración 20261127150000) es definitivo, no sesión. */
import { describe, it, expect } from 'vitest'
import { esNoReintentable, esRechazoDeEquipoAjeno, esRechazoQueDescarta, rechazoQuePuedeSerSesion, EQUIPO_TERMINADO_DETAIL } from './ronda-libre-cierre'

describe('P0003 equipo_terminado', () => {
  const error = { code: 'P0003', details: EQUIPO_TERMINADO_DETAIL }
  it('es de equipo ajeno: definitivo, se descarta y no se toma por sesión perdida', () => {
    expect(EQUIPO_TERMINADO_DETAIL).toBe('equipo_terminado')
    expect(esRechazoDeEquipoAjeno(error)).toBe(true)
    expect(esNoReintentable(error)).toBe(true)
    expect(esRechazoQueDescarta(error)).toBe(true)
    expect(rechazoQuePuedeSerSesion(error)).toBe(false)
  })
  it('un P0003 sin ese DETAIL sigue pudiendo ser sesión', () => {
    expect(rechazoQuePuedeSerSesion({ code: 'P0003', details: 'sin sesión' })).toBe(true)
    expect(esRechazoDeEquipoAjeno({ code: 'P0003', details: 'sin sesión' })).toBe(false)
  })
})
