import { describe, it, expect } from 'vitest'
import { getTaigerLine } from './taiger-line'
import type { Tendencia } from './types'

const tendenciaUp: Tendencia = { direccion: 'up', delta: 0.3, dias: 30 }
const tendenciaDown: Tendencia = { direccion: 'down', delta: 0.4, dias: 30 }
const tendenciaFlat: Tendencia = { direccion: 'flat', delta: 0.05, dias: 30 }

describe('getTaigerLine', () => {
  it('prioriza tendencia de mejora si existe', () => {
    const line = getTaigerLine({
      tendencia: tendenciaUp,
      golpesHastaSiguienteNivel: 2.5,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 2,
      totalRounds: 20,
    })
    expect(line.source).toBe('tendencia_mejora')
    expect(line.texto).toMatch(/baj|mejora/i)
    expect(line.texto).toContain('0.3')
  })

  it('menciona empeoramiento con tono neutro (no castigador)', () => {
    const line = getTaigerLine({
      tendencia: tendenciaDown,
      golpesHastaSiguienteNivel: 2.5,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 2,
      totalRounds: 20,
    })
    expect(line.source).toBe('tendencia_empeora')
    expect(line.texto).toContain('0.4')
  })

  it('si tendencia es flat, usa proximidad de nivel', () => {
    const line = getTaigerLine({
      tendencia: tendenciaFlat,
      golpesHastaSiguienteNivel: 1.5,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 2,
      totalRounds: 20,
    })
    expect(line.source).toBe('cerca_nivel')
    expect(line.texto).toContain('1.5')
    expect(line.texto).toContain('Avanzado')
  })

  it('si no hay tendencia ni nivel cercano pero usó tAIger, usa taiger_usado', () => {
    const line = getTaigerLine({
      tendencia: null,
      golpesHastaSiguienteNivel: 8,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 3,
      totalRounds: 20,
    })
    expect(line.source).toBe('taiger_usado')
  })

  it('si tiene 5+ rondas pero nunca usó tAIger, sugiere activarlo', () => {
    const line = getTaigerLine({
      tendencia: null,
      golpesHastaSiguienteNivel: 8,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 0,
      totalRounds: 5,
    })
    expect(line.source).toBe('taiger_listo')
  })

  it('fallback cuando no hay data suficiente', () => {
    const line = getTaigerLine({
      tendencia: null,
      golpesHastaSiguienteNivel: null,
      nombreSiguienteNivel: null,
      taigerSessionCount: 0,
      totalRounds: 0,
    })
    expect(line.source).toBe('fallback')
    expect(line.texto).toMatch(/Registrá|ronda/i)
  })

  it('todas las líneas incluyen cta_texto y cta_href no vacíos', () => {
    const cases = [
      { tendencia: tendenciaUp, golpesHastaSiguienteNivel: 2, nombreSiguienteNivel: 'Avanzado' as const, taigerSessionCount: 0, totalRounds: 5 },
      { tendencia: null, golpesHastaSiguienteNivel: null, nombreSiguienteNivel: null, taigerSessionCount: 0, totalRounds: 0 },
    ]
    for (const c of cases) {
      const line = getTaigerLine(c)
      expect(line.cta_texto.length).toBeGreaterThan(0)
      expect(line.cta_href.length).toBeGreaterThan(0)
    }
  })

  it('considera "cerca de nivel" solo cuando golpes_hasta < 3', () => {
    const line = getTaigerLine({
      tendencia: tendenciaFlat,
      golpesHastaSiguienteNivel: 5,
      nombreSiguienteNivel: 'Avanzado',
      taigerSessionCount: 0,
      totalRounds: 20,
    })
    expect(line.source).not.toBe('cerca_nivel')
  })
})
