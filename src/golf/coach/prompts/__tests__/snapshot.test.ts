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

  // Anti-decoración / wiring: la regla aritmética NO sirve de nada si no está
  // efectivamente dentro del system prompt que recibe el LLM. Reporte 2026-06-02:
  // el coach generó "7 pares + 8 bogeys + 3 dobles = 79" (en realidad 86).
  it('incluye la regla de INTEGRIDAD ARITMÉTICA en el prompt que recibe el LLM', () => {
    expect(TAIGER_SYSTEM_PROMPT).toContain('INTEGRIDAD ARITMÉTICA')
    // PR2 (garantía dura): la regla manda DELEGAR la aritmética en la tool
    // determinista, no "revisar la suma". El wiring se verifica acá.
    expect(TAIGER_SYSTEM_PROMPT).toContain('compute_score_projection')
  })

  // El prompt NO debe atribuir la dispersión de scores al driver: el motor no
  // tiene datos de palo. Reporte 2026-06-02 ("¿de dónde saca la info del driver?").
  it('no afirma "inconsistencia con el driver" (no hay datos de palo)', () => {
    expect(TAIGER_SYSTEM_PROMPT.toLowerCase()).not.toContain('inconsistencia con el driver')
  })
})
