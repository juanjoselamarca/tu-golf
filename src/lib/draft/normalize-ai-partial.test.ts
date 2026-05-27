import { describe, it, expect } from 'vitest'
import { normalizeAiConfigPartial } from './normalize-ai-partial'
import { tournamentConfigPartialSchema } from './schema'

describe('normalizeAiConfigPartial', () => {
  it('coerciona "net" → "neto" (regression: inbox report 34368cea)', () => {
    // Bug reproducido en 2026-05-20: Haiku 4.5 devolvió { format: "stableford", modo: "net" }
    // El zod schema rechazaba "net" porque solo acepta "neto". Resultado: 502 → frontend
    // mostraba "El asistente no pudo procesar eso, reformulá" → user reportó "no funciona".
    const raw = { format: 'stableford', modo: 'net' }
    const out = normalizeAiConfigPartial(raw)
    expect(out).toEqual({ format: 'stableford', modo: 'neto' })
    expect(tournamentConfigPartialSchema.safeParse(out).success).toBe(true)
  })

  it('coerciona "scratch" → "gross"', () => {
    const out = normalizeAiConfigPartial({ modo: 'scratch' })
    expect((out as { modo: string }).modo).toBe('gross')
  })

  it('respeta valores ya canónicos (idempotencia)', () => {
    const raw = { format: 'stroke_play', modo: 'neto' }
    const first = normalizeAiConfigPartial(raw)
    const second = normalizeAiConfigPartial(first)
    expect(first).toEqual(raw)
    expect(second).toEqual(first)
  })

  it('deja pasar variantes desconocidas (zod las rechaza después)', () => {
    const out = normalizeAiConfigPartial({ modo: 'unknown_value_xyz' })
    expect((out as { modo: string }).modo).toBe('unknown_value_xyz')
    expect(tournamentConfigPartialSchema.safeParse(out).success).toBe(false)
  })

  it('coerciona format alias comunes', () => {
    expect((normalizeAiConfigPartial({ format: 'stroke' }) as { format: string }).format).toBe('stroke_play')
    expect((normalizeAiConfigPartial({ format: 'medal' }) as { format: string }).format).toBe('stroke_play')
    expect((normalizeAiConfigPartial({ format: 'bestball' }) as { format: string }).format).toBe('best_ball')
    expect((normalizeAiConfigPartial({ format: 'fourball' }) as { format: string }).format).toBe('best_ball')
    expect((normalizeAiConfigPartial({ format: 'matchplay' }) as { format: string }).format).toBe('match_play')
  })

  it('coerciona dentro de team_config', () => {
    const out = normalizeAiConfigPartial({
      team_config: { size: 2, handicap_pct: 'manual', formation_mode: 'aleatorio' },
    })
    expect(out).toMatchObject({
      team_config: { size: 2, handicap_pct: 'custom', formation_mode: 'random' },
    })
  })

  it('coerciona registration.mode', () => {
    const out = normalizeAiConfigPartial({ registration: { mode: 'abierto' } })
    expect(out).toMatchObject({ registration: { mode: 'open_with_code' } })
  })

  it('coerciona gender en categories (array)', () => {
    const out = normalizeAiConfigPartial({
      categories: [
        { id: 'a', name: 'Damas', gender: 'damas', handicap_min: 0, handicap_max: 36 },
        { id: 'b', name: 'Varones', gender: 'varones', handicap_min: 0, handicap_max: 36 },
        { id: 'c', name: 'General', gender: null, handicap_min: 0, handicap_max: 54 },
      ],
    })
    const cats = (out as { categories: Array<{ gender: string | null }> }).categories
    expect(cats[0].gender).toBe('female')
    expect(cats[1].gender).toBe('male')
    expect(cats[2].gender).toBe(null)
  })

  it('coerciona tee_assignment_mode en rounds', () => {
    const out = normalizeAiConfigPartial({
      rounds: [{ round_number: 1, date: '2026-09-18', course_id: '11111111-1111-1111-1111-111111111111', hole_count: 9, tee_assignment_mode: 'por_jugador' }],
    })
    expect(((out as { rounds: Array<{ tee_assignment_mode: string }> }).rounds)[0].tee_assignment_mode).toBe('per_player')
  })

  it('no muta el input', () => {
    const raw = { format: 'stroke', modo: 'net' }
    const before = JSON.stringify(raw)
    normalizeAiConfigPartial(raw)
    expect(JSON.stringify(raw)).toBe(before)
  })

  it('case-insensitive', () => {
    expect((normalizeAiConfigPartial({ modo: 'NET' }) as { modo: string }).modo).toBe('neto')
    expect((normalizeAiConfigPartial({ modo: 'Net' }) as { modo: string }).modo).toBe('neto')
    expect((normalizeAiConfigPartial({ modo: ' Neto ' }) as { modo: string }).modo).toBe('neto')
  })

  it('no toca campos con tipos no-string', () => {
    const out = normalizeAiConfigPartial({
      name: 'Copa LB',
      use_handicap: true,
      is_practice: false,
      pending_confirmations: ['team_config.size'],
    })
    expect(out).toEqual({
      name: 'Copa LB',
      use_handicap: true,
      is_practice: false,
      pending_confirmations: ['team_config.size'],
    })
  })

  it('rechaza non-object input sin tirar', () => {
    expect(normalizeAiConfigPartial(null)).toBe(null)
    expect(normalizeAiConfigPartial(undefined)).toBe(undefined)
    expect(normalizeAiConfigPartial('string')).toBe('string')
    expect(normalizeAiConfigPartial(42)).toBe(42)
    expect(normalizeAiConfigPartial([])).toEqual([])
  })
})

describe('autocompleteSubConfigs (regresion inbox 047ca225)', () => {
  it('autocompleta team_config cuando format es scramble y NO se trajo team_config', () => {
    // El LLM solo entendio "scramble" del prompt "Copa Padre e Hijo scramble neto 9 hoyos".
    const out = normalizeAiConfigPartial({ format: 'scramble', modo: 'neto' }) as Record<string, unknown>
    expect(out.team_config).toEqual({
      size: 2,
      handicap_pct: 'usga_35_15',
      formation_mode: 'manual',
    })
  })

  it('autocompleta team_config cuando el LLM trajo team_config PARCIAL (solo size)', () => {
    // El LLM mapeo "en parejas" → size:2 pero olvido handicap_pct y formation_mode.
    const out = normalizeAiConfigPartial({
      format: 'scramble',
      team_config: { size: 2 },
    }) as Record<string, unknown>
    expect(out.team_config).toEqual({
      size: 2,
      handicap_pct: 'usga_35_15',
      formation_mode: 'manual',
    })
  })

  it('preserva valores explicitos del LLM sobre los defaults', () => {
    const out = normalizeAiConfigPartial({
      format: 'best_ball',
      team_config: { size: 4, handicap_pct: 'simple_avg' },
    }) as Record<string, unknown>
    expect(out.team_config).toEqual({
      size: 4,
      handicap_pct: 'simple_avg',
      formation_mode: 'manual',
    })
  })

  it('autocompleta match_play_config cuando format es match_play', () => {
    const out = normalizeAiConfigPartial({ format: 'match_play' }) as Record<string, unknown>
    expect(out.match_play_config).toEqual({
      bracket_mode: 'single_elimination',
      handicap_diff: 'full',
      extra_holes_on_tie: false,
    })
  })

  it('NO agrega team_config si format es stroke_play', () => {
    const out = normalizeAiConfigPartial({ format: 'stroke_play' }) as Record<string, unknown>
    expect(out.team_config).toBeUndefined()
    expect(out.match_play_config).toBeUndefined()
  })

  it('completa tee_assignment_mode y hole_count en rounds nuevos', () => {
    const out = normalizeAiConfigPartial({
      rounds: [{ round_number: 1, course_id: null, date: null }],
    }) as Record<string, unknown>
    expect(out.rounds).toEqual([{
      round_number: 1,
      course_id: null,
      date: null,
      tee_assignment_mode: 'per_player',
      hole_count: 18,
    }])
  })

  it('preserva hole_count y tee_assignment_mode si vienen explicitos', () => {
    const out = normalizeAiConfigPartial({
      rounds: [{ round_number: 1, hole_count: 9, tee_assignment_mode: 'per_category' }],
    }) as Record<string, unknown>
    expect((out.rounds as Array<Record<string, unknown>>)[0]).toEqual({
      round_number: 1,
      hole_count: 9,
      tee_assignment_mode: 'per_category',
    })
  })

  it('CASO REGRESION COMPLETO inbox 047ca225 — prompt scramble neto 9h en parejas', () => {
    // Simulacion del config_partial que devuelve Haiku para el prompt:
    // "Copa Padre e Hijo 2026, modalidad scramble neto en parejas 9 hoyos, sin cantidad de jugadores definida todavía"
    // Antes del fix: el merge sobre el initial config (sin team_config) producia un team_config
    // incompleto que rompia el FULL schema validation → 502 "Config IA produciria invalido".
    const llmOutput = {
      name: 'Copa Padre e Hijo 2026',
      format: 'scramble',
      modo: 'neto',
      team_config: { size: 2 },
      rounds: [{ round_number: 1, hole_count: 9 }],
    }
    const out = normalizeAiConfigPartial(llmOutput) as Record<string, unknown>
    expect(out.team_config).toEqual({
      size: 2,
      handicap_pct: 'usga_35_15',
      formation_mode: 'manual',
    })
    expect((out.rounds as Array<Record<string, unknown>>)[0]).toEqual({
      round_number: 1,
      hole_count: 9,
      tee_assignment_mode: 'per_player',
    })
  })
})
