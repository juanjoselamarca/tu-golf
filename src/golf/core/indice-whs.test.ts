import { describe, it, expect } from 'vitest'
import { calcularIndiceGolfersLocal, filaTablaWHS, TABLA_WHS_5_2 } from './indice-whs'

const desde5 = (n: number) => Array.from({ length: n }, (_, i) => 5 + i)

describe('TABLA_WHS_5_2', () => {
  it('cubre de 3 a 20 diferenciales sin huecos ni solapes', () => {
    for (let n = 3; n <= 20; n++) {
      expect(TABLA_WHS_5_2.filter(f => n >= f.desde && n <= f.hasta)).toHaveLength(1)
    }
    expect(filaTablaWHS(2)).toBeNull()
    expect(filaTablaWHS(25)).toEqual(filaTablaWHS(20))
  })
})

describe('calcularIndiceGolfersLocal (WHS 5.2)', () => {
  it('sin índice con menos de 3 diferenciales', () => {
    expect(calcularIndiceGolfersLocal([])).toBeNull()
    expect(calcularIndiceGolfersLocal([5, 6])).toBeNull()
  })

  it('con 3, 4 y 6 aplica el ajuste de -2.0, -1.0 y -1.0', () => {
    expect(calcularIndiceGolfersLocal([10, 12, 15])).toBe(8)
    expect(calcularIndiceGolfersLocal([10, 12, 15, 11])).toBe(9)
    expect(calcularIndiceGolfersLocal([10, 12, 15, 11, 13])).toBe(10)
    expect(calcularIndiceGolfersLocal([8, 9, 10, 11, 12, 14])).toBe(7.5)
  })

  it('promedia los mejores según la cantidad, sin factor 0.96', () => {
    expect(calcularIndiceGolfersLocal([10, 12, 8, 15, 11, 9, 14])).toBe(8.5)
    expect(calcularIndiceGolfersLocal(desde5(17))).toBe(7.5)
    expect(calcularIndiceGolfersLocal(desde5(18))).toBe(7.5)
    expect(calcularIndiceGolfersLocal(desde5(19))).toBe(8)
    expect(calcularIndiceGolfersLocal(desde5(20))).toBe(8.5)
  })

  it('redondea la mitad lejos de cero, como ROUND de Postgres', () => {
    // (9.1 + 9.2) / 2 en coma flotante da 9.149999…; Postgres da 9.2.
    expect(calcularIndiceGolfersLocal([9.1, 9.2, 30, 30, 30, 30, 30])).toBe(9.2)
    expect(calcularIndiceGolfersLocal([-9.1, -9.2, 30, 30, 30, 30, 30])).toBe(-9.2)
    expect(calcularIndiceGolfersLocal([31.32, 18.76, 20.2, 22.18, 16.37])).toBe(16.4)
  })

  it('nunca devuelve -0', () => {
    expect(Object.is(calcularIndiceGolfersLocal([-0.04, 1, 2, 3, 4]), 0)).toBe(true)
  })
})
