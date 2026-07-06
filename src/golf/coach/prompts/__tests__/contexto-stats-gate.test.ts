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
    expect(out).toContain('Nivel (potencial, según índice): amateur bueno')
  })

  /**
   * Potencial vs típico (jul-2026): el índice mide el TECHO (mejores 8 de 20 × 0.96),
   * no el día normal. Un jugador de alta varianza (índice 7.9 pero promedio 93.9,
   * caso real de Nicolás Claro) recibía "tu nivel índice 8" — falso para quien tira
   * 90s. El contexto ahora expone la BRECHA para que el coach la trabaje.
   */
  it('expone la brecha potencial-vs-típico cuando el promedio está muy sobre el techo del índice', () => {
    // índice 7.9 → techo ~79.9; promedio 93.9 → brecha ~14 golpes
    const out = buildContextString(baseContext({ indice: null, indice_golfers: 7.9 }))
    expect(out).toContain('POTENCIAL vs TÍPICO')
    expect(out).toContain('14 golpes')
    expect(out).toContain('cerrar la brecha')
  })

  it('NO expone brecha cuando el jugador es consistente (promedio cerca de su techo)', () => {
    // índice 7.9 → techo ~79.9; promedio 82 → brecha ~2 (< umbral 4) → sin nota
    const out = buildContextString(baseContext({ indice: null, indice_golfers: 7.9 }, { avg_score: 82 }))
    expect(out).not.toContain('POTENCIAL vs TÍPICO')
  })
})
