import { describe, it, expect } from 'vitest'
import { configFromTournament } from './duplicate-config'
import { tournamentConfigSchema } from './schema'

const src = { format: 'scramble', modo_juego: 'neto', use_handicap: true }
const LEONES = 'b1b6ba60-18f0-48a8-97c2-ef10e25fbe26'
const POLO = '6437dc6e-7f65-4e49-9e5b-e60e69f8a796'
const unaRonda9h = [{ roundNumber: 1, courseId: null, holeCount: 9 }]

describe('configFromTournament', () => {
  it('copia formato, modo, handicap, hoyos y categorías; deja nombre y fechas vacíos', () => {
    const config = configFromTournament(src, [{ name: 'Damas', handicap_min: 0, handicap_max: 36 }], unaRonda9h, () => 'c1')
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
    const config = configFromTournament({ ...src, format: 'stroke', modo_juego: 'GROSS' }, [], unaRonda9h)
    expect(config.format).toBe('stroke_play')
    expect(config.modo).toBe('gross')
    expect(tournamentConfigSchema.safeParse(config).success).toBe(true)
  })

  it('sin categorías en el origen conserva la categoría General inicial', () => {
    const config = configFromTournament(src, [], unaRonda9h)
    expect(config.categories.map((c) => c.name)).toEqual(['General'])
  })

  it('copia género y tee por defecto de cada categoría', () => {
    const config = configFromTournament(
      src,
      [
        { name: 'Damas', handicap_min: 0, handicap_max: 36, gender: 'F', default_tee_color: 'rojo' },
        { name: 'Varones', handicap_min: 0, handicap_max: 36, gender: 'M', default_tee_color: null },
      ],
      unaRonda9h,
    )
    expect(config.categories.map((c) => [c.gender, c.default_tee_color])).toEqual([
      ['female', 'rojo'],
      ['male', undefined],
    ])
  })

  it('copia cada ronda con su cancha y hoyos, sin fechas', () => {
    const config = configFromTournament(src, [], [
      { roundNumber: 1, courseId: LEONES, holeCount: 18 },
      { roundNumber: 2, courseId: POLO, holeCount: 9 },
    ])
    expect(config.rounds.map((r) => [r.round_number, r.course_id, r.hole_count, r.date])).toEqual([
      [1, LEONES, 18, null],
      [2, POLO, 9, null],
    ])
    expect(tournamentConfigSchema.safeParse(config).success).toBe(true)
  })
})
