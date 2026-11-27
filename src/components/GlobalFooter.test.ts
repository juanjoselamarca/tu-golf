import { describe, expect, it } from 'vitest'
import { footerVisible } from './GlobalFooter'

describe('footerVisible', () => {
  it('no va en los scorers (pantalla entera en la cancha)', () => {
    expect(footerVisible('/ronda-libre/2T2C4B/score-grupo')).toBe(false)
    expect(footerVisible('/ronda-libre/2T2C4B/score')).toBe(false)
    expect(footerVisible('/torneo/copa-leones/score')).toBe(false)
    expect(footerVisible('/coach/sesion/abc')).toBe(false)
  })
  it('sí va en la vista pública, el leaderboard y el resto', () => {
    expect(footerVisible('/ronda-libre/2T2C4B')).toBe(true)
    expect(footerVisible('/torneo/copa-leones/leaderboard')).toBe(true)
    expect(footerVisible('/ronda-libre/nueva')).toBe(true)
    expect(footerVisible('/')).toBe(true)
  })
})
