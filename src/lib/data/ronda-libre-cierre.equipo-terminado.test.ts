/** El rechazo de golpes de un equipo terminado (trigger de la migración 20261127150000) es definitivo, no sesión. */
import { describe, it, expect } from 'vitest'
import { esNoReintentable, esRechazoDeEquipoAjeno, esRechazoDeEquipoTerminado, esRechazoQueDescarta, rechazoQuePuedeSerSesion, EQUIPO_TERMINADO_DETAIL } from './ronda-libre-cierre'

describe('P0003 equipo_terminado', () => {
  const error = { code: 'P0003', details: EQUIPO_TERMINADO_DETAIL }
  it('definitivo y no se toma por sesión perdida (el scorer lo aparta antes de mirar esRechazoQueDescarta)', () => {
    expect(EQUIPO_TERMINADO_DETAIL).toBe('equipo_terminado')
    expect(esRechazoDeEquipoTerminado(error)).toBe(true)
    // No es «ajeno»: el golpe es propio y se aparta (Fable 2ª vuelta, predicado sin solapes).
    expect(esRechazoDeEquipoAjeno(error)).toBe(false)
    expect(esNoReintentable(error)).toBe(true)
    expect(esRechazoQueDescarta(error)).toBe(true)
    expect(rechazoQuePuedeSerSesion(error)).toBe(false)
  })
  it('un P0003 sin ese DETAIL sigue pudiendo ser sesión', () => {
    expect(rechazoQuePuedeSerSesion({ code: 'P0003', details: 'sin sesión' })).toBe(true)
    expect(esRechazoDeEquipoAjeno({ code: 'P0003', details: 'sin sesión' })).toBe(false)
    expect(esRechazoDeEquipoTerminado({ code: 'P0003', details: 'sin sesión' })).toBe(false)
    expect(esRechazoDeEquipoTerminado({ code: 'P0003', details: 'equipo_de_otro_anotador' })).toBe(false)
    expect(esRechazoDeEquipoAjeno({ code: 'P0003', details: 'equipo_de_otro_anotador' })).toBe(true)
  })
})
