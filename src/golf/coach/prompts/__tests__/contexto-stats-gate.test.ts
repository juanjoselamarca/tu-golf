import { describe, it, expect } from 'vitest'
import { buildContextString, type TaigerContext } from '../../prompts'

/**
 * Regresión (jun-2026): un usuario con 125 rondas importadas pero SIN índice
 * oficial registrado veía "Sin suficientes datos estadísticos" en el coach,
 * porque el bloque de stats se gateaba en `!indice` (oficial). El primer
 * usuario externo real (Nicolás Claro) habría tenido esa experiencia.
 * Las stats salen de las rondas (avg_score), no del índice oficial.
 */
function baseContext(overrides: Partial<TaigerContext['player']>, stats: Partial<TaigerContext['stats']> = {}): TaigerContext {
  return {
    player: { name: 'Test', handicap: null, indice: null, total_rounds: 125, ...overrides },
    stats: {
      avg_score: 93.9, best_score: 71, real_avg_18h: 93.5, real_avg_9h: 47.2,
      rounds_18h: 61, rounds_9h: 64, mental_fatigue_delta: null,
      total_birdies: 31, total_eagles: 1, front9_avg: 46.9, back9_avg: 46.9, ...stats,
    },
    patterns: [], recent_rounds: [], last_session: null,
  }
}

describe('buildContextString — gate de stats', () => {
  it('muestra stats con avg_score aunque NO haya índice oficial (usa indice_golfers)', () => {
    const out = buildContextString(baseContext({ indice: null, indice_golfers: 7.9 }))
    expect(out).not.toContain('Sin suficientes datos estadísticos')
    expect(out).toContain('Score promedio (equivalente 18 hoyos): 93.9')
    expect(out).toContain('7.9') // índice estimado visible
    expect(out).toContain('estimado Golfers+: 7.9') // perfil refleja el estimado
  })

  it('usa el índice oficial cuando existe (no el estimado)', () => {
    const out = buildContextString(baseContext({ indice: 12.4, indice_golfers: 7.9 }))
    expect(out).toContain('Índice actual: 12.4')
    expect(out).toContain('Índice oficial: 12.4')
  })

  it('sin avg_score (jugador realmente sin rondas) sí dice "Sin suficientes datos"', () => {
    const out = buildContextString(baseContext({ indice: null, indice_golfers: null }, { avg_score: null }))
    expect(out).toContain('Sin suficientes datos estadísticos')
  })

  it('nivela por índice computado cuando no hay oficial (no "sin índice registrado")', () => {
    const out = buildContextString(baseContext({ indice: null, indice_golfers: 7.9 }))
    expect(out).toContain('Nivel: amateur bueno')
  })
})
