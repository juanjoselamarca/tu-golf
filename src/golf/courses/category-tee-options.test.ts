import { describe, it, expect } from 'vitest'
import { categoryTeeOptions, isKnownCategoryTee, type CourseTees } from './category-tee-options'

const polo: CourseTees = {
  courseId: 'polo',
  courseName: 'Club de Polo',
  tees: [
    { nombre: 'Azules', genero: 'M' },
    { nombre: 'Blancas', genero: 'M' },
    { nombre: 'Rojas', genero: 'F' },
    { nombre: 'Azules', genero: 'F' },
  ],
}
const leones: CourseTees = {
  courseId: 'leones',
  courseName: 'Los Leones',
  tees: [
    { nombre: 'azules', genero: 'M' },
    { nombre: 'Amarillas', genero: 'M' },
  ],
}

describe('categoryTeeOptions', () => {
  it('deduplica sin distinguir mayúsculas y conserva el primer nombre', () => {
    const opts = categoryTeeOptions([polo, leones], null)
    expect(opts.map(o => o.nombre)).toEqual(['Azules', 'Blancas', 'Rojas', 'Amarillas'])
  })

  it('filtra por el género de la categoría', () => {
    expect(categoryTeeOptions([polo], 'female').map(o => o.nombre)).toEqual(['Rojas', 'Azules'])
    expect(categoryTeeOptions([polo], 'male').map(o => o.nombre)).toEqual(['Azules', 'Blancas'])
  })

  it('mixto no filtra', () => {
    expect(categoryTeeOptions([polo], 'mixed')).toHaveLength(3)
  })

  it('informa en qué canchas no existe cada tee', () => {
    const opts = categoryTeeOptions([polo, leones], 'male')
    expect(opts.find(o => o.nombre === 'Azules')?.missingIn).toEqual([])
    expect(opts.find(o => o.nombre === 'Blancas')?.missingIn).toEqual(['Los Leones'])
    expect(opts.find(o => o.nombre === 'Amarillas')?.missingIn).toEqual(['Club de Polo'])
  })

  it('tee sin género en catálogo se ofrece a cualquier categoría', () => {
    const c: CourseTees = { courseId: 'x', courseName: 'X', tees: [{ nombre: 'Doradas', genero: null }] }
    expect(categoryTeeOptions([c], 'female').map(o => o.nombre)).toEqual(['Doradas'])
  })

  it('sin canchas no hay opciones', () => {
    expect(categoryTeeOptions([], 'male')).toEqual([])
  })

  it('etiqueta con mayúscula inicial y guarda el nombre original', () => {
    const c: CourseTees = { courseId: 'x', courseName: 'X', tees: [{ nombre: 'negras' }] }
    expect(categoryTeeOptions([c], null)[0]).toMatchObject({ nombre: 'negras', label: 'Negras' })
  })

  it('etiqueta los tees multi-recorrido como color · loops', () => {
    const c: CourseTees = { courseId: 'x', courseName: 'X', tees: [{ nombre: 'rojo_andes pro_pacifico sur' }] }
    expect(categoryTeeOptions([c], null)[0].label).toBe('Rojo · andes pro / pacifico sur')
  })

  it('ignora nombres vacíos', () => {
    const c: CourseTees = { courseId: 'x', courseName: 'X', tees: [{ nombre: '  ' }, { nombre: null }] }
    expect(categoryTeeOptions([c], null)).toEqual([])
  })
})

describe('isKnownCategoryTee', () => {
  const opts = categoryTeeOptions([polo], null)
  it('vacío es válido (sin definir)', () => {
    expect(isKnownCategoryTee('', opts)).toBe(true)
    expect(isKnownCategoryTee(null, opts)).toBe(true)
  })
  it('reconoce sin distinguir mayúsculas', () => {
    expect(isKnownCategoryTee('azules', opts)).toBe(true)
  })
  it('rechaza texto que no es un tee de la cancha', () => {
    expect(isKnownCategoryTee('aaaa', opts)).toBe(false)
  })
})
