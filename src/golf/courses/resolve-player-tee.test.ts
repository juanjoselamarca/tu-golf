import { describe, it, expect } from 'vitest'
import { playerGenderOf, resolvePlayerTee } from './resolve-player-tee'

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

// ── Género: la fila VARONES + su hermana DAMAS viajan juntas en courseTees ──
// Números reales del catálogo (Hacienda Chicureo): blanco/M 71.6/137 en la fila
// VARONES, blanco/F 78.6/142 en la DAMAS. Siete golpes de CR para el mismo tee.

const VARONES = [
  { id: 'v-azul',   nombre: 'azul',   rating: 74.1, slope: 139, yardaje_total: 6500, genero: 'M' },
  { id: 'v-blanco', nombre: 'blanco', rating: 71.6, slope: 137, yardaje_total: 6100, genero: 'M' },
  { id: 'v-rojo',   nombre: 'rojo',   rating: 73.9, slope: 133, yardaje_total: 5300, genero: 'M' },
]
const DAMAS = [
  { id: 'd-blanco', nombre: 'blanco', rating: 78.6, slope: 142, yardaje_total: 6100, genero: 'F' },
  { id: 'd-rojo',   nombre: 'rojo',   rating: 73.9, slope: 133, yardaje_total: 5300, genero: 'F' },
]
const AMBAS = [...VARONES, ...DAMAS]

describe('resolvePlayerTee — género del jugador contra las dos filas de la cancha', () => {
  it('jugadora en torneo VARONES con tee blanco → blanco/F (rating de damas), no blanco/M', () => {
    const r = resolvePlayerTee({
      playerTeeId: null, categoryDefaultTeeColor: 'blanco', tournamentTeesGlobal: null,
      courseTees: AMBAS, playerGender: 'F',
    })
    expect(r.tee?.id).toBe('d-blanco')
    expect(r.tee?.rating).toBe(78.6)
    expect(r.source).toBe('category')
  })

  it('jugador con tee blanco → blanco/M aunque la DAMAS venga primero en la lista', () => {
    const r = resolvePlayerTee({
      playerTeeId: null, categoryDefaultTeeColor: null, tournamentTeesGlobal: 'blanco',
      courseTees: [...DAMAS, ...VARONES], playerGender: 'M',
    })
    expect(r.tee?.id).toBe('v-blanco')
    expect(r.source).toBe('global')
  })

  it('sin género conocido NO adivina: el primero por nombre (la fila del torneo va primero)', () => {
    const r = resolvePlayerTee({
      playerTeeId: null, categoryDefaultTeeColor: 'blanco', tournamentTeesGlobal: null,
      courseTees: AMBAS, playerGender: null,
    })
    expect(r.tee?.id).toBe('v-blanco')
    // Y sin la fila hermana, conducta idéntica a la de siempre.
    const solo = resolvePlayerTee({
      playerTeeId: null, categoryDefaultTeeColor: 'blanco', tournamentTeesGlobal: null,
      courseTees: VARONES, playerGender: 'F',
    })
    expect(solo.tee?.id).toBe('v-blanco')
  })

  it('fila DAMAS sucia (rojo/M): una jugadora no se rompe, cae al primero por nombre', () => {
    const sucia = [{ id: 'd-rojo-m', nombre: 'rojo', rating: 73.9, slope: 133, yardaje_total: 5300, genero: 'M' }]
    const r = resolvePlayerTee({
      playerTeeId: null, categoryDefaultTeeColor: 'rojo', tournamentTeesGlobal: null,
      courseTees: [...sucia, ...VARONES], playerGender: 'F',
    })
    expect(r.tee?.id).toBe('d-rojo-m')
    expect(r.source).toBe('category')
  })

  it('el tee_id manual elige el NOMBRE; el rating es el del género del jugador', () => {
    // El admin asignó "blanco" (fila VARONES) a una jugadora: manda el nombre
    // sobre categoría/global, pero el rating es el del blanco/F. Si no, manual
    // y global daban dos handicaps distintos a la misma jugadora por el mismo tee.
    const r = resolvePlayerTee({
      playerTeeId: 'v-blanco', categoryDefaultTeeColor: 'rojo', tournamentTeesGlobal: null,
      courseTees: AMBAS, playerGender: 'F',
    })
    expect(r.tee?.id).toBe('d-blanco')
    expect(r.source).toBe('manual')
    // Y para un jugador (o sin género) sigue siendo la fila asignada.
    const m = resolvePlayerTee({
      playerTeeId: 'v-blanco', categoryDefaultTeeColor: 'rojo', tournamentTeesGlobal: null,
      courseTees: AMBAS, playerGender: 'M',
    })
    expect(m.tee?.id).toBe('v-blanco')
    const sin = resolvePlayerTee({
      playerTeeId: 'v-blanco', categoryDefaultTeeColor: 'rojo', tournamentTeesGlobal: null,
      courseTees: AMBAS,
    })
    expect(sin.tee?.id).toBe('v-blanco')
  })

  it('genero en minúscula o largo ("f", "Femenino") también desambigua', () => {
    const tees = [{ ...VARONES[1] }, { ...DAMAS[0], genero: 'Femenino' }]
    const r = resolvePlayerTee({
      playerTeeId: null, categoryDefaultTeeColor: 'blanco', tournamentTeesGlobal: null,
      courseTees: tees, playerGender: 'F',
    })
    expect(r.tee?.id).toBe('d-blanco')
  })
})

describe('playerGenderOf — el género congelado en players primero, categoría después', () => {
  it('players.genero manda', () => {
    expect(playerGenderOf({ genero: 'F', categories: { gender: 'M' } })).toBe('F')
  })
  it('sin género congelado, la categoría (una categoría "Damas" guarda F)', () => {
    expect(playerGenderOf({ genero: null, categories: { gender: 'F' } })).toBe('F')
    expect(playerGenderOf({ categories: { gender: 'M' } })).toBe('M')
  })
  it('sin ninguno → null (no se desambigua)', () => {
    expect(playerGenderOf({ genero: null, categories: null })).toBeNull()
    expect(playerGenderOf({})).toBeNull()
    expect(playerGenderOf({ genero: '', categories: { gender: null } })).toBeNull()
  })
  it('acepta las formas del catálogo ("f", "Femenino") vía el normalizador único', () => {
    expect(playerGenderOf({ genero: 'femenino' })).toBe('F')
    expect(playerGenderOf({ genero: 'm' })).toBe('M')
  })
})
