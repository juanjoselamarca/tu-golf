import { describe, it, expect } from 'vitest'
import { TRAMOS_ROTATIVOS, hoyosPorTramo, hoyosPorTramoParejo } from './tramos'

describe('tramos de las parejas que rotan (fuente única)', () => {
  it('un tercio de la ronda: 6 en 18, 3 en 9, 9 en 27', () => {
    expect(TRAMOS_ROTATIVOS).toBe(3)
    expect([18, 9, 27].map(hoyosPorTramo)).toEqual([6, 3, 9])
    expect([18, 9, 27].map(hoyosPorTramoParejo)).toEqual([6, 3, 9])
  })

  it('si la ronda no se parte pareja, el texto no promete un número (el último tramo se lleva el resto)', () => {
    expect(hoyosPorTramoParejo(10)).toBeNull()
    expect(hoyosPorTramo(10)).toBe(3)
    expect(hoyosPorTramo(2)).toBe(1)
  })
})
