import { describe, it, expect } from 'vitest'
import {
  HANDICAP_INDEX_MAX,
  HANDICAP_INDEX_MIN,
  MENSAJE_INDICE_FUERA_DE_RANGO,
  esIndiceDeHandicapValido,
} from './handicap-index-range'

describe('esIndiceDeHandicapValido', () => {
  it('acepta índices reales, incluido 0, plus y los bordes', () => {
    for (const v of [0, 18.5, 36, -2, HANDICAP_INDEX_MIN, HANDICAP_INDEX_MAX]) {
      expect(esIndiceDeHandicapValido(v)).toBe(true)
    }
  })

  it('rechaza el typo sin coma decimal ("185" por 18.5) y valores fuera de WHS', () => {
    for (const v of [185, 54.1, 99, -10.1, -59]) {
      expect(esIndiceDeHandicapValido(v)).toBe(false)
    }
  })

  it('rechaza lo que no es un número finito', () => {
    for (const v of [NaN, Infinity, -Infinity, '18', null, undefined, {}]) {
      expect(esIndiceDeHandicapValido(v)).toBe(false)
    }
  })

  it('el mensaje muestra el plus con signo + y el máximo WHS', () => {
    expect(MENSAJE_INDICE_FUERA_DE_RANGO).toContain('+10')
    expect(MENSAJE_INDICE_FUERA_DE_RANGO).toContain('54')
  })
})
