import { describe, it, expect } from 'vitest'
import { secretsMatch, esCronAutorizado } from './secrets'

describe('secretsMatch', () => {
  it.each([
    ['abc', 'abc', true],
    ['abc', 'abd', false],
    ['abc', 'abcd', false],
    ['', '', false],
    [null, 'abc', false],
    ['abc', undefined, false],
    ['ñandú', 'ñandú', true],
  ])('%s vs %s → %s', (a, b, esperado) => expect(secretsMatch(a, b)).toBe(esperado))
})

describe('esCronAutorizado', () => {
  it('Bearer correcto → true', () => expect(esCronAutorizado('Bearer s3cr3t', 's3cr3t')).toBe(true))
  it('CRON_SECRET sin configurar → false aunque manden "Bearer undefined"', () => {
    expect(esCronAutorizado('Bearer undefined', undefined)).toBe(false)
    expect(esCronAutorizado('Bearer ', '')).toBe(false)
  })
  it('sin header → false', () => expect(esCronAutorizado(null, 's')).toBe(false))
  it('secreto equivocado → false', () => expect(esCronAutorizado('Bearer otro', 's3cr3t')).toBe(false))
})
