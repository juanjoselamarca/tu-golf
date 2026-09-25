import { describe, it, expect } from 'vitest'
import { courseGenderOf, genderVariantKey, genderVariantIds, type CourseVariantRow } from './gender-variant'

const catalog: CourseVariantRow[] = [
  { id: 'lv', nombre: 'C.G. Los Leones - Los Leones (VARONES)', fedegolf_club_id: 5 },
  { id: 'ld', nombre: 'C.G. Los Leones - Los Leones (DAMAS)', fedegolf_club_id: 5 },
  { id: 'pv', nombre: 'Club De Polo - Club de Polo (VARONES)', fedegolf_club_id: 9 },
  { id: 'otro', nombre: 'Club de Golf Los Leones', fedegolf_club_id: null },
  { id: 'xd', nombre: 'Otro Club - Los Leones (DAMAS)', fedegolf_club_id: 7 },
]

describe('courseGenderOf', () => {
  it('reconoce los marcadores', () => {
    expect(courseGenderOf('X - Y (VARONES)')).toBe('M')
    expect(courseGenderOf('X - Y (Caballeros)')).toBe('M')
    expect(courseGenderOf('X - Y (damas)')).toBe('F')
    expect(courseGenderOf('Club de Golf Los Leones')).toBeNull()
  })
})

describe('genderVariantKey', () => {
  it('iguala las dos variantes del mismo club', () => {
    expect(genderVariantKey(catalog[0].nombre, 5)).toBe(genderVariantKey(catalog[1].nombre, 5))
  })
  it('distingue clubes distintos con el mismo nombre de cancha', () => {
    expect(genderVariantKey(catalog[1].nombre, 5)).not.toBe(genderVariantKey(catalog[4].nombre, 7))
  })
})

describe('genderVariantIds', () => {
  it('devuelve la cancha primero y luego su pareja', () => {
    expect(genderVariantIds(['lv'], catalog).get('lv')).toEqual(['lv', 'ld'])
    expect(genderVariantIds(['ld'], catalog).get('ld')).toEqual(['ld', 'lv'])
  })
  it('sin pareja o sin marcador devuelve solo la cancha', () => {
    const m = genderVariantIds(['pv', 'otro', 'desconocida'], catalog)
    expect(m.get('pv')).toEqual(['pv'])
    expect(m.get('otro')).toEqual(['otro'])
    expect(m.get('desconocida')).toEqual(['desconocida'])
  })
})

describe('marcadores de género en otras formas', () => {
  it('reconoce marcador sin paréntesis (misma regla que courseGenderMarker)', () => {
    expect(courseGenderOf('Club X - Cancha DAMAS')).toBe('F')
    expect(genderVariantKey('Club X - Cancha DAMAS', 1)).toBe(genderVariantKey('Club X - Cancha (VARONES)', 1))
  })
})
