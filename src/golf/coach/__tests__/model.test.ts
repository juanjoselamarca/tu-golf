import { describe, it, expect, afterEach, vi } from 'vitest'
import { coachModel, COACH_MODEL_DEFAULT } from '../model'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('coachModel', () => {
  it('devuelve el default estable cuando COACH_MODEL no está seteado', () => {
    vi.stubEnv('COACH_MODEL', '')
    expect(coachModel()).toBe(COACH_MODEL_DEFAULT)
    expect(COACH_MODEL_DEFAULT).toBe('claude-sonnet-4-6')
  })

  it('respeta el override de COACH_MODEL (piloto Fable 5)', () => {
    vi.stubEnv('COACH_MODEL', 'claude-fable-5')
    expect(coachModel()).toBe('claude-fable-5')
  })

  it('ignora un override en blanco o con solo espacios (cae al default)', () => {
    vi.stubEnv('COACH_MODEL', '   ')
    expect(coachModel()).toBe(COACH_MODEL_DEFAULT)
  })

  it('recorta espacios alrededor del override', () => {
    vi.stubEnv('COACH_MODEL', '  claude-fable-5  ')
    expect(coachModel()).toBe('claude-fable-5')
  })
})
