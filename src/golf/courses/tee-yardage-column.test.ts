import { describe, it, expect } from 'vitest'
import { claveDeYardaje, columnaDeYardaje } from './tee-yardage-column'

describe('columnaDeYardaje', () => {
  it('los cuatro tees con columna propia', () => {
    expect(columnaDeYardaje('negras')).toBe('yardaje_negras')
    expect(columnaDeYardaje('azul')).toBe('yardaje_azul')
    expect(columnaDeYardaje('blanco')).toBe('yardaje_blanco')
    expect(columnaDeYardaje('rojo')).toBe('yardaje_rojo')
  })

  it('dorado NO cae a otro tee: no hay columna, no hay dato', () => {
    expect(columnaDeYardaje('dorado')).toBeNull()
    expect(columnaDeYardaje('Dorado')).toBeNull()
  })

  it('los demás colores del catálogo tampoco inventan columna', () => {
    for (const c of ['gris', 'amarillo', 'verde', 'plata', 'naranjo', 'oro']) {
      expect(columnaDeYardaje(c)).toBeNull()
    }
  })

  it('acepta los sinónimos EN y las variantes de género/número', () => {
    expect(columnaDeYardaje('black')).toBe('yardaje_negras')
    expect(columnaDeYardaje('negro')).toBe('yardaje_negras')
    expect(columnaDeYardaje('blue')).toBe('yardaje_azul')
    expect(columnaDeYardaje('white')).toBe('yardaje_blanco')
    expect(columnaDeYardaje('blanca')).toBe('yardaje_blanco')
    expect(columnaDeYardaje('red')).toBe('yardaje_rojo')
    expect(columnaDeYardaje('campeonato')).toBe('yardaje_negras')
  })

  it('canchas 27h: el color sale del primer token', () => {
    expect(columnaDeYardaje('azul_norte_sur')).toBe('yardaje_azul')
    expect(columnaDeYardaje('dorado_norte_sur')).toBeNull()
  })

  it('nombres con sufijo de género del catálogo', () => {
    expect(columnaDeYardaje('rojo - damas')).toBe('yardaje_rojo')
    expect(columnaDeYardaje('amarillo - damas')).toBeNull()
  })

  it('vacío, null y texto sin color dan null', () => {
    expect(claveDeYardaje(null)).toBeNull()
    expect(claveDeYardaje(undefined)).toBeNull()
    expect(claveDeYardaje('')).toBeNull()
    expect(claveDeYardaje('   ')).toBeNull()
    expect(claveDeYardaje('tee del club')).toBeNull()
  })
})
