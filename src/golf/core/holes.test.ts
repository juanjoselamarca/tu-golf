import { describe, it, expect } from 'vitest'
import { inferHoles } from './holes'

describe('inferHoles', () => {
  it('respeta holes_played cuando es 9 o 18', () => {
    expect(inferHoles({ holes_played: 18, scores: null })).toBe(18)
    expect(inferHoles({ holes_played: 9, scores: null })).toBe(9)
  })

  it('ignora holes_played con valor raro y cae a scores', () => {
    expect(inferHoles({ holes_played: 15, scores: [1,2,3,4,5,6,7,8,9] })).toBe(9)
    expect(inferHoles({ holes_played: 0, scores: new Array(18).fill(4) })).toBe(18)
  })

  it('infiere desde scores.length cuando holes_played es null', () => {
    expect(inferHoles({ holes_played: null, scores: [4,4,4,4,4,4,4,4,4] })).toBe(9)
    expect(inferHoles({ holes_played: null, scores: new Array(18).fill(4) })).toBe(18)
  })

  it('infiere desde Object.keys(scores) cuando scores es objeto', () => {
    const obj9: Record<string, number> = {}
    for (let i = 1; i <= 9; i++) obj9[String(i)] = 4
    expect(inferHoles({ holes_played: null, scores: obj9 })).toBe(9)

    const obj18: Record<string, number> = {}
    for (let i = 1; i <= 18; i++) obj18[String(i)] = 4
    expect(inferHoles({ holes_played: null, scores: obj18 })).toBe(18)
  })

  it('retorna null cuando no hay data suficiente', () => {
    expect(inferHoles({ holes_played: null, scores: null })).toBeNull()
    expect(inferHoles({ holes_played: undefined, scores: undefined })).toBeNull()
    expect(inferHoles({ holes_played: null, scores: [4,4,4] })).toBeNull()
    expect(inferHoles({ holes_played: null, scores: [4] })).toBeNull()
  })
})
