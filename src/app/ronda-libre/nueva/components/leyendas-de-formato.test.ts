import { describe, it, expect } from 'vitest'
import { LEYENDAS } from './leyendas-de-formato'

describe('LEYENDAS — Match Play', () => {
  it('en neto explica la diferencia de handicap', () => {
    expect(LEYENDAS.match_play?.explicacion('neto')).toMatch(/diferencia de handicap/)
  })

  it('en gross no promete golpes que el marcador no da', () => {
    const texto = LEYENDAS.match_play?.explicacion('gross') ?? ''
    expect(texto).toMatch(/sin handicap/)
    expect(texto).not.toMatch(/diferencia de handicap|recibe strokes/)
  })
})
