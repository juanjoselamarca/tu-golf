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

describe('configFromTournament — handicap de juego', () => {
  const stroke = { format: 'stroke_play', modo_juego: 'neto', use_handicap: true }
  it('copia el hcp_pct del torneo origen', () => {
    const config = configFromTournament({ ...stroke, hcp_pct: 85 }, [], unaRonda9h)
    expect(config.hcp_pct).toBe(85)
    expect(tournamentConfigSchema.safeParse(config).success).toBe(true)
  })
  it('origen sin la columna, al 100 % o con un valor fuera de las opciones → sin campo (100)', () => {
    expect(configFromTournament(stroke, [], unaRonda9h).hcp_pct).toBeUndefined()
    expect(configFromTournament({ ...stroke, hcp_pct: 100 }, [], unaRonda9h).hcp_pct).toBeUndefined()
    expect(configFromTournament({ ...stroke, hcp_pct: 60 }, [], unaRonda9h).hcp_pct).toBeUndefined()
  })
})

describe('configFromTournament — equipos y descripción', () => {
  const scramble = { ...src, format: 'scramble' }

  it('copia el team_config de un scramble (sin él el validador bloqueaba el duplicado)', () => {
    const team_config = { size: 4, formation_mode: 'manual', handicap: { modo: 'personalizado', porcentajes: [25, 20, 15, 10] } }
    const config = configFromTournament({ ...scramble, team_config }, [], unaRonda9h)
    expect(config.team_config).toEqual(team_config)
    expect(tournamentConfigSchema.safeParse(config).success).toBe(true)
  })

  it('convierte el team_config viejo (handicap_pct) a la forma nueva', () => {
    const config = configFromTournament({ ...scramble, team_config: { size: 2, formation_mode: 'random', handicap_pct: 'usga' } }, [], unaRonda9h)
    expect(config.team_config).toEqual({ size: 2, formation_mode: 'random', handicap: { modo: 'oficial' } })
  })

  it('un team_config inválido no se hereda (el wizard lo pide de nuevo)', () => {
    const config = configFromTournament({ ...scramble, team_config: { size: 7 } }, [], unaRonda9h)
    expect(config.team_config).toBeUndefined()
    expect(tournamentConfigSchema.safeParse(config).success).toBe(true)
  })

  it('formato individual no hereda team_config aunque la columna traiga uno', () => {
    const config = configFromTournament({ ...src, format: 'stroke_play', team_config: { size: 2, formation_mode: 'manual' } }, [], unaRonda9h)
    expect(config.team_config).toBeUndefined()
  })

  it('copia la descripción; vacía o nula queda sin campo', () => {
    expect(configFromTournament({ ...src, description: 'Polera con cuello' }, [], unaRonda9h).description).toBe('Polera con cuello')
    expect(configFromTournament({ ...src, description: '  ' }, [], unaRonda9h).description).toBeUndefined()
    expect(configFromTournament({ ...src, description: null }, [], unaRonda9h).description).toBeUndefined()
  })
})
