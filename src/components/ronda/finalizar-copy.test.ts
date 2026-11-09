import { describe, it, expect } from 'vitest'
import { tarjetaCompleta, textoConfirmarFinalizar } from './finalizar-copy'

describe('tarjetaCompleta', () => {
  it('solo sin faltantes y con todos los hoyos', () => {
    expect(tarjetaCompleta({ missingCount: 0, holesPlayed: 18, totalHoles: 18 })).toBe(true)
    expect(tarjetaCompleta({ missingCount: 1, holesPlayed: 17, totalHoles: 18 })).toBe(false)
    expect(tarjetaCompleta({ missingCount: 0, holesPlayed: 12, totalHoles: 18 })).toBe(false)
  })
})

describe('textoConfirmarFinalizar', () => {
  it('avisa los hoyos que se marcan como par', () => {
    expect(textoConfirmarFinalizar({ missingCount: 1, holesPlayed: 17, totalHoles: 18 })).toBe('¿Marcar 1 hoyo como par y finalizar?')
    expect(textoConfirmarFinalizar({ missingCount: 3, holesPlayed: 15, totalHoles: 18 })).toBe('¿Marcar 3 hoyos como par y finalizar?')
  })
  it('avisa la ronda parcial', () => {
    expect(textoConfirmarFinalizar({ missingCount: 0, holesPlayed: 12, totalHoles: 18 })).toBe('¿Guardar ronda parcial (12/18 hoyos)?')
  })
  it('con la tarjeta completa pregunta y nada más', () => {
    expect(textoConfirmarFinalizar({ missingCount: 0, holesPlayed: 18, totalHoles: 18 })).toBe('¿Finalizar ronda?')
  })
})
