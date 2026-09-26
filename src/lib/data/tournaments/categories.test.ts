import { describe, it, expect } from 'vitest'
import { categoryGenderForDb, defaultTeeColorForDb, mapCategoryForInsert } from './categories'
import type { CategoryConfig } from '@/lib/draft/types'

function cat(over: Partial<CategoryConfig> = {}): CategoryConfig {
  return {
    id: 'c1',
    name: 'Damas',
    handicap_min: 0,
    handicap_max: 36,
    gender: 'female',
    default_tee_color: 'rojo',
    ...over,
  }
}

describe('mapCategoryForInsert — gender y default_tee_color ya no se descartan', () => {
  it('persiste gender (F) y el nombre del tee', () => {
    expect(mapCategoryForInsert(cat(), 't1')).toEqual({
      tournament_id: 't1',
      name: 'Damas',
      handicap_min: 0,
      handicap_max: 36,
      gender: 'F',
      default_tee_color: 'rojo',
    })
  })

  it('male → M, mixed → null, null → null (CHECK de la tabla: M|F)', () => {
    expect(categoryGenderForDb('male')).toBe('M')
    expect(categoryGenderForDb('female')).toBe('F')
    expect(categoryGenderForDb('mixed')).toBeNull()
    expect(categoryGenderForDb(null)).toBeNull()
  })

  it('el tee se guarda trim()eado, sin normalizar (es el nombre de course_tees)', () => {
    expect(defaultTeeColorForDb('  Azules ')).toBe('Azules')
    expect(mapCategoryForInsert(cat({ default_tee_color: ' blanco ' }), 't1').default_tee_color).toBe('blanco')
  })

  it('tee vacío, sólo espacios o ausente → null', () => {
    expect(defaultTeeColorForDb('')).toBeNull()
    expect(defaultTeeColorForDb('   ')).toBeNull()
    expect(defaultTeeColorForDb(undefined)).toBeNull()
    expect(mapCategoryForInsert(cat({ default_tee_color: undefined }), 't1').default_tee_color).toBeNull()
  })

  it('el nombre se trim()ea y los rangos null se conservan', () => {
    const row = mapCategoryForInsert(cat({ name: ' General ', handicap_min: null, handicap_max: null }), 't1')
    expect(row.name).toBe('General')
    expect(row.handicap_min).toBeNull()
    expect(row.handicap_max).toBeNull()
  })
})
