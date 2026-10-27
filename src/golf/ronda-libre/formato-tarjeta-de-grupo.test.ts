import { describe, it, expect } from 'vitest'
import { formatoDeLaTarjetaDelGrupo } from './formato-tarjeta-de-grupo'

describe('formatoDeLaTarjetaDelGrupo', () => {
  it('match play de a dos: la tarjeta es match play', () => {
    expect(formatoDeLaTarjetaDelGrupo('match_play', 2)).toBe('match_play')
  })
  it.each([1, 3, 4])('match play con %i jugadores: tarjeta stroke play plana', (n) => {
    expect(formatoDeLaTarjetaDelGrupo('match_play', n)).toBe('stroke_play')
  })
  it.each(['stroke_play', 'stableford', 'scramble', 'best_ball', 'foursome'])('%s pasa tal cual', (f) => {
    expect(formatoDeLaTarjetaDelGrupo(f, 4)).toBe(f)
  })
})
