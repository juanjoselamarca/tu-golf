import { describe, it, expect } from 'vitest'
import { textoConfirmarFinalizar } from './finalizar-copy'

describe('textoConfirmarFinalizar', () => {
  it('avisa los hoyos que se marcan como par', () => {
    expect(textoConfirmarFinalizar(1)).toBe('¿Marcar 1 hoyo como par y finalizar?')
    expect(textoConfirmarFinalizar(3)).toBe('¿Marcar 3 hoyos como par y finalizar?')
  })
  it('si no falta ningún hoyo pregunta y nada más', () => {
    expect(textoConfirmarFinalizar(0)).toBe('¿Finalizar ronda?')
  })
})
