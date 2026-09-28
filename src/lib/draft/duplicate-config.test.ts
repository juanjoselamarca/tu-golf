import { describe, it, expect } from 'vitest'
import { configFromTournament } from './duplicate-config'
import { tournamentConfigSchema } from './schema'

const src = { format: 'scramble', modo_juego: 'neto', use_handicap: true, course_id: null, hole_count: 9 }

describe('configFromTournament', () => {
  it('copia formato, modo, handicap, hoyos y categorías; deja nombre y fechas vacíos', () => {
    const config = configFromTournament(src, [{ name: 'Damas', handicap_min: 0, handicap_max: 36 }], () => 'c1')
    expect(config).toMatchObject({
      format: 'scramble',
      modo: 'neto',
      use_handicap: true,
      name: '',
      date_start: null,
      categories: [{ id: 'c1', name: 'Damas', handicap_min: 0, handicap_max: 36, gender: null }],
    })
    expect(config.rounds[0]).toMatchObject({ hole_count: 9, date: null })
    expect(tournamentConfigSchema.safeParse(config).success).toBe(true)
  })

  // Un formato legacy o mal escrito en `tournaments` no puede producir un
  // borrador con base inválida (bloquearía el autosave de todo el wizard).
  it('un formato o modo fuera del schema cae al default y la config resultante es válida', () => {
    const config = configFromTournament({ ...src, format: 'stroke', modo_juego: 'GROSS' }, [])
    expect(config.format).toBe('stroke_play')
    expect(config.modo).toBe('gross')
    expect(tournamentConfigSchema.safeParse(config).success).toBe(true)
  })

  it('sin categorías en el origen conserva la categoría General inicial', () => {
    const config = configFromTournament(src, [])
    expect(config.categories.map((c) => c.name)).toEqual(['General'])
  })
})
