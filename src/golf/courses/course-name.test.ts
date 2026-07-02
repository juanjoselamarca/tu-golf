import { describe, it, expect } from 'vitest'
import { normalizeCourseName, canonicalOrdered, courseGenderMarker } from './course-name'

describe('normalizeCourseName — canónica para matching', () => {
  it('quita acentos y baja a minúsculas', () => {
    expect(normalizeCourseName('Club de Golf Chicureó')).toBe(normalizeCourseName('club de golf chicureo'))
  })

  it('expande/neutraliza abreviatura C.G. == Club de Golf', () => {
    // "C.G." y "Club de Golf" deben producir la misma forma canónica
    expect(normalizeCourseName('C.G. Las Brisas'))
      .toBe(normalizeCourseName('Club de Golf Las Brisas'))
  })

  it('quita marcadores de género (VARONES/DAMAS/CABALLEROS)', () => {
    expect(normalizeCourseName('Las Brisas (VARONES)'))
      .toBe(normalizeCourseName('Las Brisas (DAMAS)'))
    expect(normalizeCourseName('Las Brisas (VARONES)'))
      .toBe(normalizeCourseName('Las Brisas'))
  })

  it('es insensible al orden de los tokens del loop (Norte-Este == Este-Norte)', () => {
    expect(normalizeCourseName('Santo Domingo Norte-Este'))
      .toBe(normalizeCourseName('Santo Domingo Este - Norte'))
  })

  it('normaliza separadores ~, -, /, . a espacio', () => {
    expect(normalizeCourseName('Rocas ~ Roja/Azul'))
      .toBe(normalizeCourseName('Rocas - Roja - Azul'))
  })

  it('CASO REAL: ronda Garmin == ficha FedeGolf tras normalizar', () => {
    const ronda   = 'Club de Golf Las Brisas de Santo Domingo ~ Norte-Este'
    const catalogo = 'C.G. Las Brisas De Santo Domingo - Este - Norte (VARONES)'
    expect(normalizeCourseName(ronda)).toBe(normalizeCourseName(catalogo))
  })

  it('canchas distintas NO colapsan a la misma forma', () => {
    expect(normalizeCourseName('Las Brisas de Santo Domingo Norte-Este'))
      .not.toBe(normalizeCourseName('Las Brisas de Chicureo El Valle'))
  })

  it('no revienta con string vacío o basura', () => {
    expect(normalizeCourseName('')).toBe('')
    expect(normalizeCourseName('   ~~~   ')).toBe('')
  })
})

describe('canonicalOrdered — sensible al orden del loop', () => {
  it('DISTINGUE Norte-Este de Este-Norte (pares hoyo-a-hoyo difieren)', () => {
    expect(canonicalOrdered('Santo Domingo Norte-Este'))
      .not.toBe(canonicalOrdered('Santo Domingo Este-Norte'))
  })

  it('CASO REAL: la ronda "Norte-Este" coincide EXACTO con la ficha "Norte - Este"', () => {
    expect(canonicalOrdered('Club de Golf Las Brisas de Santo Domingo ~ Norte-Este'))
      .toBe(canonicalOrdered('C.G. Las Brisas De Santo Domingo - Norte - Este (VARONES)'))
  })

  it('CASO REAL: la ronda "Norte-Este" NO coincide exacto con la ficha "Este - Norte"', () => {
    expect(canonicalOrdered('Club de Golf Las Brisas de Santo Domingo ~ Norte-Este'))
      .not.toBe(canonicalOrdered('C.G. Las Brisas De Santo Domingo - Este - Norte (VARONES)'))
  })

  it('sigue neutralizando C.G./género/puntuación', () => {
    expect(canonicalOrdered('C.G. Las Brisas (VARONES)'))
      .toBe(canonicalOrdered('Club de Golf Las Brisas'))
  })
})

describe('courseGenderMarker — extrae género de un nombre de catálogo', () => {
  it('detecta VARONES → V', () => {
    expect(courseGenderMarker('C.G. Las Brisas - Norte (VARONES)')).toBe('V')
  })
  it('detecta DAMAS → D', () => {
    expect(courseGenderMarker('C.G. Las Brisas - Norte (DAMAS)')).toBe('D')
  })
  it('CABALLEROS cuenta como V', () => {
    expect(courseGenderMarker('Foo (CABALLEROS)')).toBe('V')
  })
  it('sin marcador → null', () => {
    expect(courseGenderMarker('Club de Golf Chicureo')).toBeNull()
  })
})
