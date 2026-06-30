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

// H-01 (auditoría 2026-06-27): el guard secuestraba turnos que NO piden un score.
// El caso real de campo: el coach mapeaba números de hoyo a una ronda de 18 y
// mencionó "par 72" → 72 cerca de "par", no trazable → BLOQUEADO con el mensaje
// robótico "pídemelo de nuevo". Falsos positivos a matar SIN debilitar el guard.
describe('guardNumbers — no secuestra turnos no-score (H-01)', () => {
  it('"par 72" es un PAR (total de la cancha), no un score fabricado → NO bloquea', () => {
    const r = guardNumbers({ text: 'Jugás en una cancha par 72, enfócate hoyo a hoyo.', allowedNumbers: [] })
    expect(r.blocked).toBe(false)
  })

  it('"par 71" tampoco bloquea (canchas chilenas par 71)', () => {
    const r = guardNumbers({ text: 'Los Leones es par 71, así que un bogey es par.', allowedNumbers: [] })
    expect(r.blocked).toBe(false)
  })

  it('"comparar" contiene "par" pero NO es la palabra par → no dispara el guard', () => {
    const r = guardNumbers({ text: 'Necesito comparar tu 88 con la media del grupo.', allowedNumbers: [] })
    expect(r.blocked).toBe(false)
  })

  it('una distancia ("150 metros") cerca de "hoyo" no es un score → no bloquea', () => {
    const r = guardNumbers({ text: 'El hoyo 4 mide 150 metros al green.', allowedNumbers: [] })
    expect(r.blocked).toBe(false)
  })

  // El guard SIGUE intacto: un score absoluto fabricado se bloquea igual.
  it('REGRESIÓN: un score fabricado ("terminás en 81") se sigue bloqueando', () => {
    const r = guardNumbers({ text: 'Si seguís así terminás en 81.', allowedNumbers: [] })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('81')
  })

  it('REGRESIÓN: un target fabricado no-par ("apuntá a 79") se sigue bloqueando', () => {
    const r = guardNumbers({ text: 'Apuntá a 79 esta ronda.', allowedNumbers: [] })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('79')
  })

  // BLOCKER del review: la exención de PAR no puede dejar pasar un score disfrazado
  // de par. Un par real es ~70-73 (18h) o ~36 (9h), JAMÁS 85/95.
  it('REGRESIÓN: "par 85" no es un par real (>73) → se bloquea como score fabricado', () => {
    const r = guardNumbers({ text: 'Tu objetivo es par 85 esta ronda.', allowedNumbers: [] })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('85')
  })

  it('"par 36" (9 hoyos) sigue exento (par real)', () => {
    const r = guardNumbers({ text: 'Esa vuelta de 9 es par 36.', allowedNumbers: [] })
    expect(r.blocked).toBe(false)
  })

  // Important del review: "pares" (plural) es palabra de golf legítima — un score
  // fabricado adyacente NO debe escaparse por el cambio a palabra completa.
  it('REGRESIÓN: score fabricado junto a "pares" (plural) se sigue bloqueando', () => {
    const r = guardNumbers({ text: 'Hiciste 6 pares, total 85 golpes.', allowedNumbers: [] })
    expect(r.blocked).toBe(true)
    expect(r.offending).toContain('85')
  })

  it('"comparar" sigue sin disparar pese a "par(es)?"', () => {
    const r = guardNumbers({ text: 'Necesito comparar tu 88 con la media.', allowedNumbers: [] })
    expect(r.blocked).toBe(false)
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
