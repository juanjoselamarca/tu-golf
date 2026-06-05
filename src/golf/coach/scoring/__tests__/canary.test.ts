import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { projectScore } from '../breakdown'

const cases = JSON.parse(
  readFileSync(resolve(__dirname, '../../../../../tests/regression/coach-aritmetica-set.json'), 'utf8'),
) as Array<{
  id: string; parTotal: number | null; holes: number;
  distribution?: Record<string, number>; targetOver?: number;
  expectOver: number; expectAbsolute: number | null
}>

describe('canario aritmético del coach (set permanente)', () => {
  for (const c of cases) {
    it(`${c.id}: cierra exactamente`, () => {
      const r = projectScore({ parTotal: c.parTotal, holes: c.holes, distribution: c.distribution, targetOver: c.targetOver })
      expect(r.over, 'over').toBe(c.expectOver)
      expect(r.absolute, 'absolute').toBe(c.expectAbsolute)
    })
  }
})
