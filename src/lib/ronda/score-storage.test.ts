import { describe, it, expect, beforeEach } from 'vitest'
import { saveScores, loadScores, clearScores, SCORE_STORAGE_KEY } from './score-storage'

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
