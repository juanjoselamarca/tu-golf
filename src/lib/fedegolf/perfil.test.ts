import { describe, it, expect } from 'vitest'
import { fedegolfSexoToGenero, parseFedegolfPerfil } from './client'

describe('fedegolfSexoToGenero', () => {
  it('mapea variantes masculinas a M', () => {
    for (const v of ['Varon', 'varón', 'VARON', 'Masculino', 'Hombre', 'M']) {
      expect(fedegolfSexoToGenero(v)).toBe('M')
    }
  })

  it('mapea variantes femeninas a F', () => {
    for (const v of ['Dama', 'Damas', 'Mujer', 'Femenino', 'F']) {
      expect(fedegolfSexoToGenero(v)).toBe('F')
    }
  })

  it('devuelve null para valores no reconocidos o vacíos', () => {
    for (const v of ['', '   ', 'otro', 'X', null, undefined, 42, {}]) {
      expect(fedegolfSexoToGenero(v as unknown)).toBeNull()
    }
  })
})

describe('parseFedegolfPerfil', () => {
  it('arma el nombre completo y mapea el género (caso real Juanjo)', () => {
    const p = parseFedegolfPerfil({
      Usuario: 28086,
      Nombres: 'Jorge Juan José',
      Apellido_Paterno: 'Lamarca',
      Apellido_Materno: 'Oyarzún',
      sexo: 'Varon',
    })
    expect(p).toEqual({
      usuarioId: 28086,
      nombreCompleto: 'Jorge Juan José Lamarca Oyarzún',
      genero: 'M',
      sexoRaw: 'Varon',
    })
  })

  it('tolera campos faltantes sin romper', () => {
    const p = parseFedegolfPerfil({ Nombres: 'Ana', sexo: 'Dama' })
    expect(p.nombreCompleto).toBe('Ana')
    expect(p.genero).toBe('F')
    expect(p.usuarioId).toBeNull()
  })

  it('nombreCompleto null si no hay ningún nombre', () => {
    const p = parseFedegolfPerfil({ sexo: 'Varon' })
    expect(p.nombreCompleto).toBeNull()
    expect(p.genero).toBe('M')
  })

  it('null-safe con data vacía/indefinida', () => {
    expect(parseFedegolfPerfil(null)).toEqual({ usuarioId: null, nombreCompleto: null, genero: null, sexoRaw: null })
    expect(parseFedegolfPerfil(undefined).nombreCompleto).toBeNull()
  })

  it('convierte Usuario string a número', () => {
    expect(parseFedegolfPerfil({ Usuario: '28086' }).usuarioId).toBe(28086)
  })

  it('Usuario vacío o no numérico → usuarioId null (no 0)', () => {
    expect(parseFedegolfPerfil({ Usuario: '' }).usuarioId).toBeNull()
    expect(parseFedegolfPerfil({ Usuario: '   ' }).usuarioId).toBeNull()
    expect(parseFedegolfPerfil({ Usuario: 'abc' }).usuarioId).toBeNull()
  })
})
