import { describe, it, expect } from 'vitest'
import { nextVote } from './useMessageFeedback'

describe('nextVote — toggle del voto por mensaje', () => {
  it('sin voto previo + 👍 → 👍', () => {
    expect(nextVote(undefined, 1)).toBe(1)
  })

  it('sin voto previo + 👎 → 👎', () => {
    expect(nextVote(undefined, -1)).toBe(-1)
  })

  it('tocar el mismo pulgar lo retira (toggle off → 0)', () => {
    expect(nextVote(1, 1)).toBe(0)
    expect(nextVote(-1, -1)).toBe(0)
  })

  it('tocar el pulgar opuesto cambia el voto', () => {
    expect(nextVote(1, -1)).toBe(-1)
    expect(nextVote(-1, 1)).toBe(1)
  })
})
