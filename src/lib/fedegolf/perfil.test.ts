import { describe, it, expect } from 'vitest'
import { fedegolfSexoToGenero, parseFedegolfPerfil, fedegolfFechaNacimiento } from './client'

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

describe('fedegolfFechaNacimiento', () => {
  it('acepta fecha ISO válida (con o sin sufijo de hora)', () => {
    expect(fedegolfFechaNacimiento('1997-05-19')).toBe('1997-05-19')
    expect(fedegolfFechaNacimiento(' 1997-05-19 ')).toBe('1997-05-19')
    expect(fedegolfFechaNacimiento('1997-05-19 00:00:00')).toBe('1997-05-19')
  })

  it('rechaza placeholders, fechas imposibles y años futuros', () => {
    const nextYear = new Date().getUTCFullYear() + 1
    for (const v of ['0000-00-00', '2020-13-40', '1997-02-30', '1800-01-01', '2200-01-01', `${nextYear}-01-01`]) {
      expect(fedegolfFechaNacimiento(v)).toBeNull()
    }
  })

  it('rechaza basura / tipos no-string', () => {
    for (const v of ['', '   ', 'ayer', '19-05-1997', null, undefined, 42, {}]) {
      expect(fedegolfFechaNacimiento(v as unknown)).toBeNull()
    }
  })
})

describe('parseFedegolfPerfil', () => {
  it('arma el nombre completo, género y nacimiento (caso real Juanjo)', () => {
    const p = parseFedegolfPerfil({
      Usuario: 28086,
      Nombres: 'Jorge Juan José',
      Apellido_Paterno: 'Lamarca',
      Apellido_Materno: 'Oyarzún',
      sexo: 'Varon',
      fecha_nacimiento: '1997-05-19',
    })
    expect(p).toEqual({
      usuarioId: 28086,
      nombreCompleto: 'Jorge Juan José Lamarca Oyarzún',
      genero: 'M',
      sexoRaw: 'Varon',
      fechaNacimiento: '1997-05-19',
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
    expect(parseFedegolfPerfil(null)).toEqual({
      usuarioId: null,
      nombreCompleto: null,
      genero: null,
      sexoRaw: null,
      fechaNacimiento: null,
    })
    expect(parseFedegolfPerfil(undefined).nombreCompleto).toBeNull()
  })

  it('sin fecha_nacimiento → fechaNacimiento null', () => {
    expect(parseFedegolfPerfil({ Nombres: 'Ana', sexo: 'Dama' }).fechaNacimiento).toBeNull()
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
