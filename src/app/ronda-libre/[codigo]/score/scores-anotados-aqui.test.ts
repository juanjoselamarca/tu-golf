import { describe, it, expect, beforeEach } from 'vitest'
import { scoresAnotadosEnEsteTelefono } from './scores-anotados-aqui'
import { aplicarScoresLocales } from '@/components/MiniLeaderboard'
import { saveScores } from '@/lib/ronda/score-storage'

describe('leaderboard del scorer: golpes anotados en este teléfono', () => {
  beforeEach(() => { localStorage.clear() })

  it('un teléfono que anota por Ana y Bea ve a LAS DOS con lo local; Caro (otro teléfono) sale del servidor', () => {
    // Este teléfono anotó a Ana y a Bea (respaldo local en cada cambio de golpe).
    saveScores('ABC', 'ana', { 1: 4, 2: 5 })
    saveScores('ABC', 'bea', { 1: 3 })
    // Estado en memoria: Ana y Bea con lo último; Caro con el valor del MONTAJE (viejo).
    const enMemoria = { ana: { 1: 4, 2: 5, 3: 4 }, bea: { 1: 3, 2: 4 }, caro: { 1: 6 } }
    const locales = scoresAnotadosEnEsteTelefono('ABC', ['ana', 'bea', 'caro'], enMemoria)
    expect(Object.keys(locales).sort()).toEqual(['ana', 'bea'])

    // El servidor (CDN) viene atrasado para Ana y Bea y adelantado para Caro.
    const servidor = [
      { id: 'ana', scores: { 1: 4 } as Record<string, number> },
      { id: 'bea', scores: {} as Record<string, number> },
      { id: 'caro', scores: { 1: 6, 2: 5, 3: 5 } as Record<string, number> },
    ]
    const vista = aplicarScoresLocales(servidor, locales)
    expect(vista.find(j => j.id === 'ana')!.scores).toEqual({ 1: 4, 2: 5, 3: 4 }) // no retrocede
    expect(vista.find(j => j.id === 'bea')!.scores).toEqual({ 1: 3, 2: 4 }) // no retrocede (antes: sólo el activo)
    expect(vista.find(j => j.id === 'caro')!.scores).toEqual({ 1: 6, 2: 5, 3: 5 }) // no se congela
  })

  it('mezcla POR HOYO: si Ana siguió anotando en otro teléfono, sus hoyos nuevos aparecen (no se congela)', () => {
    saveScores('ABC', 'ana', { 1: 4, 2: 5 })
    const locales = scoresAnotadosEnEsteTelefono('ABC', ['ana'], { ana: { 1: 4, 2: 5 } })
    const servidor = [{ id: 'ana', scores: { 1: 4, 2: 5, 3: 4, 4: 3 } as Record<string, number> }]
    expect(aplicarScoresLocales(servidor, locales)[0].scores).toEqual({ 1: 4, 2: 5, 3: 4, 4: 3 })
  })

  it('sin nada anotado en este teléfono, todo sale del servidor', () => {
    expect(scoresAnotadosEnEsteTelefono('ABC', ['ana'], { ana: { 1: 4 } })).toEqual({})
  })
})
