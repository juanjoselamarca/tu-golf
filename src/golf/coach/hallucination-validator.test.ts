import { describe, it, expect } from 'vitest'
import { validateResponse } from './hallucination-validator'

describe('validateResponse — anti-alucinacion shadow', () => {
  it('NO flaguea cuando el numero citado aparece en contexto', () => {
    const out = validateResponse({
      response: 'Tu última ronda fue 85 con 32 putts.',
      contextString: 'Última ronda: 85 golpes con 32 putts en Marbella.',
      toolResultsConcat: '',
      knownCourseNames: ['Marbella'],
    })
    expect(out.flagged).toBe(false)
    expect(out.warnings).toHaveLength(0)
  })

  it('FLAGUEA cuando el numero de score citado NO aparece en haystack', () => {
    const out = validateResponse({
      response: 'Tu última ronda fue 78 en Pinos.',
      contextString: 'Sin rondas registradas.',
      toolResultsConcat: '',
      knownCourseNames: [],
    })
    // 78 cerca de "ronda" → flag por unknown_number
    const numWarning = out.warnings.find(w => w.kind === 'unknown_number')
    expect(numWarning).toBeTruthy()
    expect(numWarning?.evidence).toBe('78')
  })

  it('NO flaguea numeros de hoyo (1-18) aunque no aparezcan literalmente en haystack', () => {
    const out = validateResponse({
      response: 'En el hoyo 7 trabajá la rutina pre-shot.',
      contextString: '',
      toolResultsConcat: '',
      knownCourseNames: [],
    })
    // 7 < 30 → no flag
    const numWarning = out.warnings.find(w => w.kind === 'unknown_number')
    expect(numWarning).toBeUndefined()
  })

  it('FLAGUEA cuando el coach inventa una cancha que no esta en las conocidas', () => {
    const out = validateResponse({
      response: 'Recordá que en Hurlingham marcaste un buen score.',
      contextString: 'Última ronda: 85 en Marbella.',
      toolResultsConcat: '',
      knownCourseNames: ['Marbella'],
    })
    const courseWarning = out.warnings.find(w => w.kind === 'unknown_course')
    expect(courseWarning).toBeTruthy()
  })

  it('NO flaguea cancha cuando aparece en knownCourseNames con match parcial', () => {
    const out = validateResponse({
      response: 'En Marbella jugaste bien.',
      contextString: 'Cancha: Marbella DAMAS',
      toolResultsConcat: '',
      knownCourseNames: ['Marbella DAMAS'],
    })
    const courseWarning = out.warnings.find(w => w.kind === 'unknown_course')
    expect(courseWarning).toBeUndefined()
  })

  it('encuentra el numero en tool results aunque no este en contexto', () => {
    const out = validateResponse({
      response: 'Tu último score fue 92, una mejora.',
      contextString: 'Sin score reciente.',
      toolResultsConcat: '{"ok":true,"data":{"total_gross":92,"course_name":"Olivos"}}',
      knownCourseNames: ['Olivos'],
    })
    expect(out.flagged).toBe(false)
  })

  it('cuenta total_numbers_checked y total_courses_checked', () => {
    const out = validateResponse({
      response: 'Tu score fue 85 en Marbella, 88 en Olivos. Trabajá rutina.',
      contextString: '85 en Marbella, 88 en Olivos.',
      toolResultsConcat: '',
      knownCourseNames: ['Marbella', 'Olivos'],
    })
    expect(out.flagged).toBe(false)
    expect(out.total_numbers_checked).toBeGreaterThanOrEqual(1)
  })

  it('numeros sin contexto de scoring no se cuentan', () => {
    const out = validateResponse({
      response: 'Te recomiendo 60 minutos de práctica.',
      contextString: '',
      toolResultsConcat: '',
      knownCourseNames: [],
    })
    // "60 minutos" — no hay keyword de score cerca → no se cuenta
    expect(out.total_numbers_checked).toBe(0)
    expect(out.flagged).toBe(false)
  })
})
