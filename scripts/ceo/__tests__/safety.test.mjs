import { describe, it, expect } from 'vitest'
import { sospechosoEnProduction } from '../safety.mjs'

const pr = (number, headRefName, mergedAt) => ({ number, headRefName, mergedAt, mergeCommit: { oid: `sha${number}` } })

describe('sospechosoEnProduction', () => {
  it('salta el PR nocturno más nuevo que no llegó a production y culpa al anterior que sí', () => {
    const prs = [pr(1, 'fix/ceo-qa-a', '2026-11-02T03:00:00Z'), pr(2, 'fix/ceo-qa-b', '2026-11-02T04:00:00Z')]
    expect(sospechosoEnProduction(prs, p => p.number === 1)).toEqual({ nocturnos: 2, pr: prs[0] })
  })

  it('un PR humano o un revert automático en production no es sospechoso', () => {
    const prs = [pr(3, 'fix/algo-max', '2026-11-02T05:00:00Z'), pr(4, 'fix/ceo-revert-2-claude', '2026-11-02T06:00:00Z')]
    expect(sospechosoEnProduction(prs, () => true)).toEqual({ nocturnos: 0, pr: undefined })
  })

  it('sin ningún PR nocturno en production no hay a quién revertir', () => {
    const prs = [pr(5, 'feat/ceo-ux-c', '2026-11-02T02:00:00Z')]
    expect(sospechosoEnProduction(prs, () => false)).toEqual({ nocturnos: 1, pr: undefined })
  })
})
