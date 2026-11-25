import { describe, it, expect } from 'vitest'
import { esCodigoTransitorio, esFilaInexistente } from './codigos-postgrest'
import { LecturaFallidaError, detalleDeLecturaFallida } from './lectura-fallida'

describe('esCodigoTransitorio', () => {
  it.each([
    '57014', '40001', '40P01', '55P03', 'PGRST000', 'PGRST001', 'PGRST002', 'PGRST003',
    '08000', '08006', '08P01', '53300', '53200', '57P01', '57P03',
  ])('%s es transitorio (la base no pudo contestar ahora)', codigo => {
    expect(esCodigoTransitorio(codigo)).toBe(true)
  })

  it.each(['42501', '42703', '42P01', '22P02', 'PGRST116', 'PGRST100', 'PGRST301', '23505', '57000'])(
    '%s es permanente', codigo => { expect(esCodigoTransitorio(codigo)).toBe(false) },
  )

  it('sin código no es transitorio por código (eso lo decide quien sabe que no vino: LecturaFallidaError)', () => {
    expect(esCodigoTransitorio('')).toBe(false)
    expect(esCodigoTransitorio(null)).toBe(false)
    expect(esCodigoTransitorio(undefined)).toBe(false)
  })

  it('PGRST116 es la fila inexistente; nada más lo es', () => {
    expect(esFilaInexistente('PGRST116')).toBe(true)
    expect(esFilaInexistente('57014')).toBe(false)
    expect(esFilaInexistente(undefined)).toBe(false)
  })
})

describe('LecturaFallidaError.deSenal', () => {
  it('sin code (fetch caído o 502/520 con cuerpo HTML) y con code transitorio: reintentable', () => {
    expect(new LecturaFallidaError('x', '').deSenal).toBe(true)
    expect(new LecturaFallidaError('x', undefined).deSenal).toBe(true)
    expect(new LecturaFallidaError('x', '57014').deSenal).toBe(true)
    expect(new LecturaFallidaError('x', 'PGRST003').deSenal).toBe(true)
  })

  it('con code permanente: no', () => {
    expect(new LecturaFallidaError('x', '42501').deSenal).toBe(false)
    expect(new LecturaFallidaError('x', '42703').deSenal).toBe(false)
  })
})

describe('detalleDeLecturaFallida', () => {
  it('encuentra el code en la cadena de cause', () => {
    const lectura = new LecturaFallidaError('No se pudo leer el rating del tee: permission denied', '42501')
    const envuelto = new Error('mensaje para el jugador', { cause: lectura })
    expect(detalleDeLecturaFallida(envuelto)).toEqual({ codigoPostgrest: '42501', causa: lectura.message })
    expect(detalleDeLecturaFallida(lectura)).toEqual({ codigoPostgrest: '42501', causa: lectura.message })
  })

  it('sin LecturaFallidaError: sin código, con el error de más adentro', () => {
    expect(detalleDeLecturaFallida(new Error('a', { cause: new TypeError('b') }))).toEqual({ codigoPostgrest: null, causa: 'TypeError: b' })
    expect(detalleDeLecturaFallida('raro')).toEqual({ codigoPostgrest: null, causa: null })
  })
})
