import { describe, it, expect } from 'vitest'
import { guardNumbers, collectAuthorizedNumbers } from '../number-guard'

describe('guardNumbers', () => {
  const allowed = ['86', '84', '72', '+12'] // del contexto + tool results

  it('deja pasar números trazables a la fuente', () => {
    const r = guardNumbers({ text: 'Tu promedio es 86, objetivo 84.', allowedNumbers: allowed })
    expect(r.blocked).toBe(false)
  })

  it('bloquea un score fabricado no trazable', () => {
    const r = guardNumbers({ text: 'Si hacés ese plan terminás en 79.', allowedNumbers: allowed })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('79')
  })

  it('ignora números no-score (duración, hoyo)', () => {
    const r = guardNumbers({ text: 'Practicá 45 minutos el hoyo 7.', allowedNumbers: allowed })
    expect(r.blocked).toBe(false)
  })

  it('deja pasar relativo +12 si está en allowed', () => {
    const r = guardNumbers({ text: 'Apuntá a +12 sobre par.', allowedNumbers: allowed })
    expect(r.blocked).toBe(false)
  })

  it('bloquea un absoluto fabricado aunque cite "sobre par"', () => {
    const r = guardNumbers({ text: 'Con ese plan terminás en 81 sobre par.', allowedNumbers: allowed })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('81')
  })

  // P0 (review 2026-06-05): la exención de duración NO puede dispararse por mera
  // co-ocurrencia de "día"/"semana" en la ventana — son palabras comunes en copy
  // de coaching y dejarían pasar un score fabricado.
  it('bloquea un absoluto fabricado cuando "día" aparece cerca pero no pegado al número', () => {
    const r = guardNumbers({ text: 'El objetivo del día es 80.', allowedNumbers: allowed })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('80')
  })

  it('bloquea un absoluto fabricado con "semana" en la frase', () => {
    const r = guardNumbers({ text: 'Esta semana apuntá a 80 sobre par.', allowedNumbers: allowed })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('80')
  })

  it('exime una duración real pegada al número (90 minutos)', () => {
    const r = guardNumbers({ text: 'Practicá 90 minutos el approach esta semana.', allowedNumbers: allowed })
    expect(r.blocked).toBe(false)
  })

  it('exime "90 días" pero bloquea el score fabricado de la misma frase', () => {
    const r = guardNumbers({ text: 'En 90 días podés bajar a 80.', allowedNumbers: allowed })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('80')
    expect(r.offending).not.toContain('90')
  })
})

describe('collectAuthorizedNumbers', () => {
  it('junta los números de los tool results y del contexto', () => {
    // El guard solo vigila absolutos de 2-3 dígitos y relativos de 2+ dígitos;
    // los relativos de 1 dígito (+7) son la expresión segura y no se vigilan.
    const toolResults = ['{"over":14,"absolute":86,"relativeLabel":"+14"}']
    const ctx = 'Promedio 18h: 86. Mejor: 81.'
    const got = collectAuthorizedNumbers(toolResults, ctx)
    expect(got).toContain('86')
    expect(got).toContain('+14')
    expect(got).toContain('81')
  })
})
