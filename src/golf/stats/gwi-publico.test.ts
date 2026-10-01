import { describe, it, expect } from 'vitest'
import { calcularGWI, redactarGWIParaPublico, type JugadorGWIInput } from './gwi'

const jugador = (id: string, currentScore: number): JugadorGWIInput => ({
  id, nombre: id, handicapIndex: 12, currentScore, hoyosCompletados: 9,
  modoJuego: 'gross', formatoJuego: 'stroke_play',
  historicalAvg: 8.4, historicalRoundsCount: 20, courseAvg: 6.1, courseRoundsCount: 5,
  patterns: { back9Collapse: { confidence: 0.8, avgDiff: 3 } },
})

describe('redactarGWIParaPublico — GWI para espectadores', () => {
  const inputs = [jugador('a', 2), jugador('b', 5)]

  it('quita historial, promedio en la cancha y patrones (datos personales)', () => {
    for (const j of redactarGWIParaPublico(inputs)) {
      expect(j).toMatchObject({ historicalAvg: null, historicalRoundsCount: 0, courseAvg: null, courseRoundsCount: 0, patterns: null })
      expect(JSON.stringify(j)).not.toMatch(/back9Collapse|8\.4|6\.1/)
    }
  })

  it('conserva lo que ya es público en el leaderboard (score, hoyos, hándicap)', () => {
    const [a] = redactarGWIParaPublico(inputs)
    expect(a).toMatchObject({ id: 'a', currentScore: 2, hoyosCompletados: 9, handicapIndex: 12 })
  })

  it('no muta el input y el GWI se sigue calculando (probabilidades suman ~100)', () => {
    redactarGWIParaPublico(inputs)
    expect(inputs[0].historicalAvg).toBe(8.4)
    const res = calcularGWI(redactarGWIParaPublico(inputs), 18)
    expect(res).toHaveLength(2)
    const total = res.reduce((s, r) => s + r.winProbability, 0)
    expect(total).toBeGreaterThan(98)
    expect(total).toBeLessThan(102)
  })
})
