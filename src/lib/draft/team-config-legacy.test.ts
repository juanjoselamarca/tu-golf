import { describe, it, expect } from 'vitest'
import { normalizarTeamConfig, leerTeamConfig } from './team-config-legacy'
import { teamConfigSchema, tournamentConfigPartialSchema } from './schema'
import { upgradeConfig } from './upgrade-config'

const base = { size: 2, formation_mode: 'manual' } as const

describe('normalizarTeamConfig — forma vieja → nueva', () => {
  it.each(['usga_35_15', 'usga_25_15', 'simple_avg'])('%s → oficial', (pct) => {
    expect(normalizarTeamConfig({ ...base, handicap_pct: pct })).toEqual({ ...base, handicap: { modo: 'oficial' } })
  })

  it('custom con lower/higher en parejas → personalizado [menor, mayor]', () => {
    const raw = { ...base, handicap_pct: 'custom', handicap_pct_custom: { lower_pct: 60, higher_pct: 40 } }
    expect(normalizarTeamConfig(raw)).toEqual({ ...base, handicap: { modo: 'personalizado', porcentajes: [60, 40] } })
  })

  it.each([3, 4])('custom en equipos de %i → oficial (no se inventan posiciones)', (size) => {
    const raw = { size, formation_mode: 'random', handicap_pct: 'custom', handicap_pct_custom: { lower_pct: 60, higher_pct: 40 } }
    expect(normalizarTeamConfig(raw)).toEqual({ size, formation_mode: 'random', handicap: { modo: 'oficial' } })
  })

  it('custom sin porcentajes o sin tamaño → oficial', () => {
    expect(normalizarTeamConfig({ ...base, handicap_pct: 'custom' })).toEqual({ ...base, handicap: { modo: 'oficial' } })
    expect(normalizarTeamConfig({ handicap_pct: 'custom', handicap_pct_custom: { lower_pct: 60, higher_pct: 40 } }))
      .toEqual({ handicap: { modo: 'oficial' } })
  })

  it('custom con % no enteros o fuera de 0-100 → oficial (no se inventa un personalizado inválido)', () => {
    for (const custom of [{ lower_pct: 35.5, higher_pct: 15 }, { lower_pct: 120, higher_pct: 15 }]) {
      expect(normalizarTeamConfig({ ...base, handicap_pct: 'custom', handicap_pct_custom: custom }))
        .toEqual({ ...base, handicap: { modo: 'oficial' } })
    }
  })

  it('el schema rechaza porcentajes con decimales (mismo predicado que el wizard y el validador)', () => {
    const r = tournamentConfigPartialSchema.safeParse({ team_config: { handicap: { modo: 'personalizado', porcentajes: [35.5, 15] } } })
    expect(r.success).toBe(false)
    expect(tournamentConfigPartialSchema.safeParse({ team_config: { handicap: { modo: 'personalizado', porcentaje_suma: 40.5 } } }).success).toBe(false)
  })

  it('si ya viene `handicap`, gana y las llaves viejas se descartan', () => {
    const raw = { ...base, handicap_pct: 'usga_35_15', handicap: { modo: 'personalizado', porcentajes: [50, 50] } }
    expect(normalizarTeamConfig(raw)).toEqual({ ...base, handicap: { modo: 'personalizado', porcentajes: [50, 50] } })
  })

  it('forma nueva, parciales y no-objetos pasan intactos', () => {
    const nueva = { ...base, handicap: { modo: 'oficial' } }
    expect(normalizarTeamConfig(nueva)).toBe(nueva)
    expect(normalizarTeamConfig({ size: 4 })).toEqual({ size: 4 })
    expect(normalizarTeamConfig(null)).toBeNull()
    expect(normalizarTeamConfig('x')).toBe('x')
  })

  it('no muta el objeto de entrada', () => {
    const raw = { ...base, handicap_pct: 'usga_35_15' }
    normalizarTeamConfig(raw)
    expect(raw).toEqual({ ...base, handicap_pct: 'usga_35_15' })
  })

  it('leerTeamConfig: JSONB guardado → forma nueva tipada, o null', () => {
    expect(leerTeamConfig({ size: 2, handicap_pct: 'usga_35_15' })?.handicap).toEqual({ modo: 'oficial' })
    expect(leerTeamConfig(null)).toBeNull()
  })
})

describe('schema + upgradeConfig leen la forma vieja', () => {
  it('teamConfigSchema acepta un team_config viejo y devuelve la forma nueva', () => {
    const r = teamConfigSchema.safeParse({ ...base, handicap_pct: 'usga_35_15' })
    expect(r.success).toBe(true)
    expect(r.success && r.data).toEqual({ ...base, handicap: { modo: 'oficial' } })
  })

  it('el schema parcial también normaliza', () => {
    const r = tournamentConfigPartialSchema.safeParse({ team_config: { handicap_pct: 'simple_avg' } })
    expect(r.success && r.data.team_config).toEqual({ handicap: { modo: 'oficial' } })
  })

  it('personalizado con un % fuera de rango no se cuela como "incompleto"', () => {
    const r = teamConfigSchema.safeParse({ ...base, handicap: { modo: 'personalizado', porcentajes: [150, 15] } })
    expect(r.success).toBe(false)
  })

  it('upgradeConfig reescribe team_config viejo (lo que el PATCH guarda)', () => {
    const cfg = upgradeConfig({ schema_version: 1, team_config: { ...base, handicap_pct: 'usga_25_15' } as never })
    expect(cfg.team_config).toEqual({ ...base, handicap: { modo: 'oficial' } })
  })
})
