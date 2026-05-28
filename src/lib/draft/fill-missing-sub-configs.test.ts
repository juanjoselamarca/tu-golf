import { describe, it, expect } from 'vitest'
import { fillMissingSubConfigs } from './fill-missing-sub-configs'
import { createInitialConfig } from './initial-config'
import { deepMergeConfig } from './deep-merge-config'
import { tournamentConfigPartialSchema, tournamentConfigSchema } from './schema'
import { normalizeAiConfigPartial } from './normalize-ai-partial'
import type { TournamentConfig, TournamentConfigPartial } from './types'

function makeConfig(overrides: Partial<TournamentConfig>): TournamentConfig {
  return { ...createInitialConfig(), ...overrides }
}

describe('fillMissingSubConfigs — post-merge defense (inbox 047ca225)', () => {
  it('crea team_config con defaults cuando format es scramble y NO existe', () => {
    const c = makeConfig({ format: 'scramble' })
    const paths = fillMissingSubConfigs(c)
    expect(c.team_config).toEqual({
      size: 2,
      handicap_pct: 'usga_35_15',
      formation_mode: 'manual',
    })
    expect(paths).toEqual([
      'team_config.size',
      'team_config.handicap_pct',
      'team_config.formation_mode',
    ])
  })

  it('aplica a best_ball y foursome igual que scramble', () => {
    for (const format of ['best_ball', 'foursome'] as const) {
      const c = makeConfig({ format })
      fillMissingSubConfigs(c)
      expect(c.team_config).toBeDefined()
    }
  })

  it('NO crea team_config para stroke_play ni stableford', () => {
    for (const format of ['stroke_play', 'stableford'] as const) {
      const c = makeConfig({ format })
      const paths = fillMissingSubConfigs(c)
      expect(c.team_config).toBeUndefined()
      expect(paths).toEqual([])
    }
  })

  it('PRESERVA valores del organizador (C1 del code review)', () => {
    // Caso multi-turno: organizador ya configuro team_config completo, despues
    // pide cambio parcial. NO debemos pisar handicap_pct ni formation_mode.
    const c = makeConfig({
      format: 'scramble',
      team_config: {
        size: 4,
        handicap_pct: 'simple_avg',
        formation_mode: 'random',
      },
    })
    const paths = fillMissingSubConfigs(c)
    expect(c.team_config).toEqual({
      size: 4,
      handicap_pct: 'simple_avg',
      formation_mode: 'random',
    })
    expect(paths).toEqual([])
  })

  it('rellena SOLO los campos faltantes y reporta solo esos en paths', () => {
    // Organizador configuro handicap_pct manualmente, pero LLM trajo team_config
    // con solo size:3 y borro el resto durante el merge → ahora hay size pero no
    // handicap_pct ni formation_mode. Rellenamos solo esos dos.
    const c = makeConfig({
      format: 'scramble',
      team_config: { size: 3 } as TournamentConfig['team_config'],
    })
    const paths = fillMissingSubConfigs(c)
    expect(c.team_config).toEqual({
      size: 3,
      handicap_pct: 'usga_35_15',
      formation_mode: 'manual',
    })
    expect(paths).toEqual(['team_config.handicap_pct', 'team_config.formation_mode'])
  })

  it('crea match_play_config con defaults cuando format es match_play y NO existe', () => {
    const c = makeConfig({ format: 'match_play' })
    const paths = fillMissingSubConfigs(c)
    expect(c.match_play_config).toEqual({
      bracket_mode: 'single_elimination',
      handicap_diff: 'full',
      extra_holes_on_tie: false,
    })
    expect(paths).toEqual([
      'match_play_config.bracket_mode',
      'match_play_config.handicap_diff',
      'match_play_config.extra_holes_on_tie',
    ])
  })

  it('completa tee_assignment_mode y hole_count en rounds faltantes', () => {
    const c = makeConfig({
      rounds: [
        // round 1 ya tiene todo (initial-config lo dejo asi)
        { round_number: 1, date: null, course_id: null, hole_count: 18, tee_assignment_mode: 'per_player' },
        // round 2 viene incompleto desde el LLM
        { round_number: 2, date: null, course_id: null } as TournamentConfig['rounds'][0],
      ],
    })
    const paths = fillMissingSubConfigs(c)
    expect(c.rounds[1].tee_assignment_mode).toBe('per_player')
    expect(c.rounds[1].hole_count).toBe(18)
    expect(paths).toEqual(['rounds[1].tee_assignment_mode', 'rounds[1].hole_count'])
  })

  it('es idempotente: aplicar dos veces deja paths vacios la segunda vez', () => {
    const c = makeConfig({ format: 'scramble' })
    const paths1 = fillMissingSubConfigs(c)
    expect(paths1.length).toBeGreaterThan(0)
    const paths2 = fillMissingSubConfigs(c)
    expect(paths2).toEqual([])
  })

  it('END-TO-END regresion inbox 047ca225: normalize + merge + fill + FULL validate', () => {
    // Pipeline completo simulado del endpoint del asistente con el prompt de Juanjo.
    // Antes del fix: el FULL safeParse fallaba con 502 "Config IA produciria invalido".
    const base = createInitialConfig()

    // Simulacion del config_partial que devuelve Haiku 4.5 para el prompt:
    // "Copa Padre e Hijo 2026, modalidad scramble neto en parejas 9 hoyos,
    //  sin cantidad de jugadores definida todavia"
    const llmRaw = {
      name: 'Copa Padre e Hijo 2026',
      format: 'scramble',
      modo: 'neto',
      team_config: { size: 2 },
      rounds: [{ round_number: 1, hole_count: 9 }],
    }

    // 1. normalize (coerce literales, no toca sub-configs)
    const normalized = normalizeAiConfigPartial(llmRaw)
    // 2. validar partial
    const partialResult = tournamentConfigPartialSchema.safeParse(normalized)
    expect(partialResult.success).toBe(true)
    if (!partialResult.success) return
    // 3. merge
    const merged = deepMergeConfig(base, partialResult.data as TournamentConfigPartial)
    // 4. defense in depth post-merge
    const filledPaths = fillMissingSubConfigs(merged)
    // 5. FULL validate
    const fullResult = tournamentConfigSchema.safeParse(merged)
    expect(fullResult.success).toBe(true)

    // Verificaciones de comportamiento:
    expect(merged.team_config).toEqual({
      size: 2, // del LLM
      handicap_pct: 'usga_35_15', // del fill
      formation_mode: 'manual', // del fill
    })
    expect(merged.rounds[0].hole_count).toBe(9) // del LLM
    expect(merged.rounds[0].tee_assignment_mode).toBe('per_player') // del initial config (ya estaba)
    // Los paths autocompletados deben pasar al pending_confirmations:
    expect(filledPaths).toContain('team_config.handicap_pct')
    expect(filledPaths).toContain('team_config.formation_mode')
  })

  it('END-TO-END multi-turno: organizador YA configuro team_config, LLM pide cambio parcial', () => {
    // Scenario que CRITICO 1 del code review detecto: turn 1 organizador
    // configuro team_config completo, turn 2 pide "cambialo a equipos de 4".
    // Mi fix anterior pisaba handicap_pct/formation_mode silenciosamente.
    // El fix actual (post-merge fill) NO debe pisarlos.
    const turn1Base = makeConfig({
      format: 'scramble',
      team_config: {
        size: 2,
        handicap_pct: 'simple_avg',
        formation_mode: 'random',
      },
    })

    const turn2LLM = { team_config: { size: 4 } }
    const normalized = normalizeAiConfigPartial(turn2LLM)
    const partialResult = tournamentConfigPartialSchema.safeParse(normalized)
    expect(partialResult.success).toBe(true)
    if (!partialResult.success) return
    const merged = deepMergeConfig(turn1Base, partialResult.data as TournamentConfigPartial)
    const filledPaths = fillMissingSubConfigs(merged)

    // Verificacion clave: los valores del organizador SOBREVIVEN.
    expect(merged.team_config).toEqual({
      size: 4, // del LLM (cambio pedido)
      handicap_pct: 'simple_avg', // del turn1Base (PRESERVADO)
      formation_mode: 'random', // del turn1Base (PRESERVADO)
    })
    // No deberia haber paths autocompletados porque nada falto.
    expect(filledPaths).toEqual([])
  })
})
