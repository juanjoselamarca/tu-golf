import { describe, it, expect } from 'vitest'
import { EXAM_CASES } from '../fixtures'

describe('Banco golden del examen', () => {
  it('tiene al menos 20 casos (Fase 0 pide 20-30)', () => {
    expect(EXAM_CASES.length).toBeGreaterThanOrEqual(20)
  })

  it('todos los ids son únicos y kebab/snake legibles', () => {
    const ids = EXAM_CASES.map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const id of ids) expect(id).toMatch(/^[a-z0-9_]+$/)
  })

  it('cada caso tiene userMessage no vacío y una rúbrica con arrays', () => {
    for (const c of EXAM_CASES) {
      expect(c.userMessage.trim().length).toBeGreaterThan(0)
      expect(Array.isArray(c.rubric.must)).toBe(true)
      expect(Array.isArray(c.rubric.mustNot)).toBe(true)
    }
  })

  it('los casos de 6 piezas declaran applicable + minScore válido (1-6)', () => {
    const sixers = EXAM_CASES.filter((c) => c.sixPieces?.applicable)
    expect(sixers.length).toBeGreaterThanOrEqual(6)
    for (const c of sixers) {
      expect(c.sixPieces!.minScore).toBeGreaterThanOrEqual(1)
      expect(c.sixPieces!.minScore).toBeLessThanOrEqual(6)
    }
  })

  it('cada caso tiene al menos un tag', () => {
    for (const c of EXAM_CASES) expect(c.tags.length).toBeGreaterThan(0)
  })
})
