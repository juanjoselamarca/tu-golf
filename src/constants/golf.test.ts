import { describe, it, expect } from 'vitest'
import { formatOverUnder, relacionConElPar, vsParEnPalabras } from './golf'

// Antes el mismo mapeo vivía copiado en la imagen para compartir (dos veces), en el
// texto que la acompaña y en la vista de ronda terminada: una fuente (PR #757).
describe('vs par en palabras', () => {
  it('formatOverUnder: E, +n, -n', () => {
    expect(formatOverUnder(0)).toBe('E')
    expect(formatOverUnder(3)).toBe('+3')
    expect(formatOverUnder(-2)).toBe('-2')
  })

  it('relacionConElPar: sin número', () => {
    expect(relacionConElPar(0)).toBe('en el par')
    expect(relacionConElPar(5)).toBe('sobre el par')
    expect(relacionConElPar(-1)).toBe('bajo el par')
  })

  it('vsParEnPalabras: con número', () => {
    expect(vsParEnPalabras(0)).toBe('Par')
    expect(vsParEnPalabras(5)).toBe('+5 sobre par')
    expect(vsParEnPalabras(-1)).toBe('-1 bajo par')
  })
})
