import { describe, it, expect, beforeEach } from 'vitest'
import { escribirRetirosConfirmados, guardarRetiroConfirmado, leerRetirosConfirmados } from './retiros-confirmados'
import { limpiarCopiaLocalDeRonda, RETIROS_TIMBA_KEY } from './score-storage'

beforeEach(() => localStorage.clear())

describe('retiros confirmados (localStorage)', () => {
  it('guarda por código de ronda y se lee de vuelta', () => {
    guardarRetiroConfirmado('ABC', 'tomas', 14)
    guardarRetiroConfirmado('ABC', 'pedro', null)
    expect(leerRetirosConfirmados('ABC')).toEqual({ tomas: 14, pedro: null })
    expect(leerRetirosConfirmados('OTRA')).toEqual({})
  })
  it('vacío borra la clave; basura se ignora', () => {
    escribirRetirosConfirmados('ABC', {})
    expect(localStorage.getItem(RETIROS_TIMBA_KEY('ABC'))).toBeNull()
    localStorage.setItem(RETIROS_TIMBA_KEY('ABC'), '{"a":"x","b":3,"c":null}')
    expect(leerRetirosConfirmados('ABC')).toEqual({ b: 3, c: null })
    localStorage.setItem(RETIROS_TIMBA_KEY('ABC'), 'no-json')
    expect(leerRetirosConfirmados('ABC')).toEqual({})
  })
  it('se borra con la copia local de la ronda', () => {
    guardarRetiroConfirmado('ABC', 'tomas', 14)
    limpiarCopiaLocalDeRonda('ABC')
    expect(leerRetirosConfirmados('ABC')).toEqual({})
  })
})
