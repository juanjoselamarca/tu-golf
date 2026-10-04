import { describe, it, expect, beforeEach } from 'vitest'
import { saveScores, loadScores, clearScores, SCORE_STORAGE_KEY, saveScorerGrupoSnapshot, loadScorerGrupoSnapshot, clearScorerGrupoSnapshot, clearAllScorerGrupoSnapshots, marcarPendientes, confirmarPendientes, leerPendientes, hayPendientes, ID_PENDIENTE_EQUIPO } from './score-storage'

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
    at: Date.now(), authUserId: 'u1', anotadorNombre: 'Juanjo', ronda: { id: 'r1' },
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

describe('pendientes de confirmar (revisión Fable, caída 04-oct)', () => {
  beforeEach(() => localStorage.clear())
  it('marca y confirma sólo el valor exacto enviado', () => {
    marcarPendientes('ABC', 'j1', { 5: 6 })
    confirmarPendientes('ABC', 'j1', { 5: 4 }) // viajaba un valor viejo: NO limpia
    expect(leerPendientes('ABC')).toEqual({ j1: { 5: 6 } })
    confirmarPendientes('ABC', 'j1', { 5: 6 })
    expect(hayPendientes('ABC')).toBe(false)
  })
  it('equipos con su propia clave', () => {
    marcarPendientes('ABC', ID_PENDIENTE_EQUIPO('e1'), { 3: 4 })
    expect(leerPendientes('ABC')).toEqual({ 'eq:e1': { 3: 4 } })
  })
  it('la copia del scorer vence a las 24 h', () => {
    saveScorerGrupoSnapshot('ABC', { at: Date.now() - 25 * 3_600_000, authUserId: 'u1', anotadorNombre: '', ronda: { id: 'r' }, parMap: {}, holeDataMap: {}, playerHcp: {}, playerDisplayHcp: {}, teamEquipos: [] })
    expect(loadScorerGrupoSnapshot('ABC', 'u1')).toBeNull()
  })
  it('al cerrar sesión se borran todas las copias del scorer', () => {
    saveScorerGrupoSnapshot('A1', { at: Date.now(), authUserId: 'u1', anotadorNombre: '', ronda: { id: 'r' }, parMap: {}, holeDataMap: {}, playerHcp: {}, playerDisplayHcp: {}, teamEquipos: [] })
    localStorage.setItem('otra_cosa', '1')
    clearAllScorerGrupoSnapshots()
    expect(loadScorerGrupoSnapshot('A1', 'u1')).toBeNull()
    expect(localStorage.getItem('otra_cosa')).toBe('1')
  })
})
