import { describe, it, expect } from 'vitest'
import { resolvePlayerTee } from './resolve-player-tee'

const courseTees = [
  { id: 't-azul',   nombre: 'Azul',   rating: 70.3, slope: 129, yardaje_total: 6573, genero: 'M' },
  { id: 't-blanco', nombre: 'Blanco', rating: 67.9, slope: 120, yardaje_total: 5950, genero: 'M' },
  { id: 't-rojo',   nombre: 'Rojo',   rating: 69.8, slope: 115, yardaje_total: 5240, genero: 'F' },
  { id: 't-negras', nombre: 'Negras', rating: 73.8, slope: 140, yardaje_total: 6810, genero: 'M' },
]

describe('resolvePlayerTee', () => {
  it('1. usa players.tee_id cuando está asignado', () => {
    const r = resolvePlayerTee({
      playerTeeId: 't-negras',
      categoryDefaultTeeColor: 'Azul',
      tournamentTeesGlobal: 'Blanco',
      courseTees,
    })
    expect(r.tee?.id).toBe('t-negras')
    expect(r.source).toBe('manual')
  })

  it('2. cae a category.default_tee_color cuando no hay tee_id', () => {
    const r = resolvePlayerTee({
      playerTeeId: null,
      categoryDefaultTeeColor: 'Rojo',
      tournamentTeesGlobal: 'Blanco',
      courseTees,
    })
    expect(r.tee?.id).toBe('t-rojo')
    expect(r.source).toBe('category')
  })

  it('3. cae a tournament.tees global cuando tampoco hay categoría', () => {
    const r = resolvePlayerTee({
      playerTeeId: null,
      categoryDefaultTeeColor: null,
      tournamentTeesGlobal: 'Blanco',
      courseTees,
    })
    expect(r.tee?.id).toBe('t-blanco')
    expect(r.source).toBe('global')
  })

  it('4. retorna { tee: null, source: "none" } si nada matchea', () => {
    const r = resolvePlayerTee({
      playerTeeId: null,
      categoryDefaultTeeColor: null,
      tournamentTeesGlobal: null,
      courseTees,
    })
    expect(r.tee).toBeNull()
    expect(r.source).toBe('none')
  })

  it('5. tee_id apunta a un tee de OTRA cancha → cae al siguiente nivel', () => {
    const r = resolvePlayerTee({
      playerTeeId: 't-de-otra-cancha-no-existe',
      categoryDefaultTeeColor: 'Azul',
      tournamentTeesGlobal: 'Blanco',
      courseTees,
    })
    expect(r.tee?.id).toBe('t-azul')
    expect(r.source).toBe('category')
  })

  it('6. match por nombre es case-insensitive', () => {
    const r = resolvePlayerTee({
      playerTeeId: null,
      categoryDefaultTeeColor: 'AZUL',
      tournamentTeesGlobal: null,
      courseTees,
    })
    expect(r.tee?.id).toBe('t-azul')
    expect(r.source).toBe('category')
  })

  it('7. courseTees vacío → { tee: null, source: "none" } sin throw', () => {
    const r = resolvePlayerTee({
      playerTeeId: 'cualquiera',
      categoryDefaultTeeColor: 'Azul',
      tournamentTeesGlobal: 'Blanco',
      courseTees: [],
    })
    expect(r.tee).toBeNull()
    expect(r.source).toBe('none')
  })
})
