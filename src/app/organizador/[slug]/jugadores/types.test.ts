import { describe, it, expect } from 'vitest'
import { isTeamFormat, TEAM_FORMATS } from './types'

describe('isTeamFormat — detección de formato de equipos (grupo=equipo)', () => {
  it('reconoce los 3 formatos de equipo', () => {
    expect(isTeamFormat('best_ball')).toBe(true)
    expect(isTeamFormat('scramble')).toBe(true)
    expect(isTeamFormat('foursome')).toBe(true)
  })

  it('los formatos individuales NO son de equipo', () => {
    expect(isTeamFormat('stroke_play')).toBe(false)
    expect(isTeamFormat('stableford')).toBe(false)
    expect(isTeamFormat('match_play')).toBe(false)
  })

  it('maneja undefined/null/vacío sin romper', () => {
    expect(isTeamFormat(undefined)).toBe(false)
    expect(isTeamFormat(null)).toBe(false)
    expect(isTeamFormat('')).toBe(false)
  })

  it('TEAM_FORMATS tiene exactamente los 3 formatos esperados', () => {
    expect([...TEAM_FORMATS]).toEqual(['best_ball', 'scramble', 'foursome'])
  })
})
