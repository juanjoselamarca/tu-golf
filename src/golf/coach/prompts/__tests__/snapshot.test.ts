import { describe, it, expect } from 'vitest'
import { TAIGER_SYSTEM_PROMPT } from '../../prompts'

describe('TAIGER_SYSTEM_PROMPT snapshot', () => {
  it('preserva el prompt actual antes del refactor', () => {
    expect(TAIGER_SYSTEM_PROMPT).toMatchSnapshot()
  })

  it('contiene la sección de identidad de tAIger+', () => {
    expect(TAIGER_SYSTEM_PROMPT).toContain('tAIger+')
  })

  it('contiene la sección de anti-hallucination "MANEJO DE DATOS"', () => {
    expect(TAIGER_SYSTEM_PROMPT).toContain('MANEJO DE DATOS')
  })
})
