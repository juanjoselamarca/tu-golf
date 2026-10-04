import { describe, it, expect, beforeEach } from 'vitest'
import { saveScores, loadScores, clearScores, SCORE_STORAGE_KEY, saveScorerGrupoSnapshot, loadScorerGrupoSnapshot, clearScorerGrupoSnapshot } from './score-storage'

beforeEach(() => localStorage.clear())

describe('score-storage', () => {
  it('roundtrip: save → load', () => {
    saveScores('ABC', 'j1', { 1: 4, 2: 5 })
    expect(loadScores('ABC', 'j1')).toEqual({ 1: 4, 2: 5 })
  })

  it('returns {} when nothing saved', () => {
    expect(loadScores('ABC', 'j1')).toEqual({})
  })

  it('clear removes saved scores', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    clearScores('ABC', 'j1')
    expect(loadScores('ABC', 'j1')).toEqual({})
  })

  it('different jugadorId → isolated', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    saveScores('ABC', 'j2', { 1: 5 })
    expect(loadScores('ABC', 'j1')).toEqual({ 1: 4 })
    expect(loadScores('ABC', 'j2')).toEqual({ 1: 5 })
  })

  it('different codigo → isolated', () => {
    saveScores('ABC', 'j1', { 1: 4 })
    saveScores('XYZ', 'j1', { 1: 5 })
    expect(loadScores('ABC', 'j1')).toEqual({ 1: 4 })
    expect(loadScores('XYZ', 'j1')).toEqual({ 1: 5 })
  })

  it('malformed JSON in localStorage returns {}', () => {
    localStorage.setItem(SCORE_STORAGE_KEY('ABC', 'j1'), 'not-json')
    expect(loadScores('ABC', 'j1')).toEqual({})
  })
})

describe('snapshot del scorer de grupo (abrir sin servidor, caída 04-oct)', () => {
  const snap = {
    at: 1, authUserId: 'u1', anotadorNombre: 'Juanjo', ronda: { id: 'r1' },
    parMap: { 1: 4 }, holeDataMap: {}, playerHcp: { j1: 10 }, playerDisplayHcp: { j1: 10 }, teamEquipos: [],
  }
  beforeEach(() => localStorage.clear())

  it('guarda y lee la copia del mismo usuario', () => {
    saveScorerGrupoSnapshot('ABC', snap)
    expect(loadScorerGrupoSnapshot('ABC', 'u1')?.ronda).toEqual({ id: 'r1' })
  })
  it('sin usuario conocido (sesión no legible) igual devuelve la copia del teléfono', () => {
    saveScorerGrupoSnapshot('ABC', snap)
    expect(loadScorerGrupoSnapshot('ABC', null)?.authUserId).toBe('u1')
  })
  it('nunca entrega la copia de OTRO usuario', () => {
    saveScorerGrupoSnapshot('ABC', snap)
    expect(loadScorerGrupoSnapshot('ABC', 'u2')).toBeNull()
  })
  it('null si está corrupta o es de otra versión', () => {
    localStorage.setItem('scorer_grupo_snapshot_ABC', '{no json')
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
    localStorage.setItem('scorer_grupo_snapshot_ABC', JSON.stringify({ ...snap, v: 99 }))
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
  })
  it('clear borra la copia', () => {
    saveScorerGrupoSnapshot('ABC', snap)
    clearScorerGrupoSnapshot('ABC')
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
  })
})
