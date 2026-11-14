import { describe, expect, it } from 'vitest'
import { reconstructScores } from './garmin-color-reconstruction'

const suma = (s: Record<string, number>) => Object.values(s).reduce((a, b) => a + b, 0)

describe('reconstructScores (barra de colores de Garmin → golpes por hoyo)', () => {
  it('todo verde y total = par: cada hoyo queda en par, confianza alta', () => {
    const r = reconstructScores(Array(9).fill('green'), 36, 0, 9)
    expect(Object.values(r.scores)).toEqual(Array(9).fill(4))
    expect(r.confidence).toBe(0.95)
    expect(r.ambiguousHoles).toEqual([])
  })

  it('usa los pares de la cancha cuando vienen', () => {
    const pares = { 1: 4, 2: 5, 3: 3, 4: 4, 5: 4, 6: 3, 7: 5, 8: 4, 9: 4 }
    const r = reconstructScores(Array(9).fill('green'), 36, 0, 9, pares)
    expect(r.scores).toEqual({ 1: 4, 2: 5, 3: 3, 4: 4, 5: 4, 6: 3, 7: 5, 8: 4, 9: 4 })
  })

  it('sin pares de cancha reparte par 3 en los hoyos 3, 6 y 9 para cuadrar el par total', () => {
    const r = reconstructScores(Array(9).fill('green'), 33, 0, 9)
    expect([r.scores['3'], r.scores['6'], r.scores['9']]).toEqual([3, 3, 3])
    expect(suma(r.scores)).toBe(33)
  })

  it('golpes que sobran van primero al hoyo rojo (doble bogey+), con tope de +2 extra', () => {
    const colores = ['red', ...Array(8).fill('green')]
    const r = reconstructScores(colores, 40, 4, 9)
    expect(r.scores['1']).toBe(8)
    expect(suma(r.scores)).toBe(40)
    expect(r.ambiguousHoles).toEqual([1])
    expect(r.confidence).toBe(0.85)
  })

  it('si la IA contó rojos de más, los baja a bogey y cuadra el total', () => {
    const colores = ['red', 'red', ...Array(7).fill('green')]
    const r = reconstructScores(colores, 37, 1, 9)
    expect(r.scores['1']).toBe(4)
    expect(r.scores['2']).toBe(5)
    expect(suma(r.scores)).toBe(37)
    expect(r.ambiguousHoles).toEqual([1])
  })

  it('celeste resta uno (birdie) y nunca deja un hoyo bajo 1 golpe', () => {
    const r = reconstructScores(['light_blue', ...Array(8).fill('green')], 35, -1, 9)
    expect(r.scores['1']).toBe(3)
    expect(suma(r.scores)).toBe(35)
  })
})
