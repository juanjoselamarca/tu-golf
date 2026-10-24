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
      team_config: { size: 2, handicap: 'usga', formation_mode: 'aleatorio' },
    })
    expect(out).toMatchObject({
      team_config: { size: 2, handicap: { modo: 'oficial' }, formation_mode: 'random' },
    })
  })

  it('team_config.handicap: sinónimos de modo y porcentajes escritos como texto', () => {
    const tc = (h: unknown) =>
      (normalizeAiConfigPartial({ team_config: { handicap: h } }) as { team_config: { handicap: unknown } }).team_config.handicap
    expect(tc('Oficial')).toEqual({ modo: 'oficial' })
    expect(tc('recomendado')).toEqual({ modo: 'oficial' })
    expect(tc('custom')).toEqual({ modo: 'personalizado' })
    expect(tc({ modo: 'manual', porcentajes: ['40%', '20 %', 10] })).toEqual({ modo: 'personalizado', porcentajes: [40, 20, 10] })
    expect(tc({ modo: 'personalizado', porcentaje_suma: '40' })).toEqual({ modo: 'personalizado', porcentaje_suma: 40 })
    expect(tc('cualquier_cosa')).toBe('cualquier_cosa')
    // Porcentajes sin modo: solo pueden ser un personalizado (no se rechaza el turno).
    expect(tc({ porcentajes: [40, 20] })).toEqual({ modo: 'personalizado', porcentajes: [40, 20] })
    expect(tc({ porcentaje_suma: '45%' })).toEqual({ modo: 'personalizado', porcentaje_suma: 45 })
    expect(tc({ modo: null, porcentajes: [40, 20] })).toEqual({ modo: 'personalizado', porcentajes: [40, 20] })
    // personalizado sin números pasa el schema; el validador de golf pide completarlo.
    expect(tournamentConfigPartialSchema.safeParse({ team_config: { handicap: tc('custom') } }).success).toBe(true)
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

describe('tee_assignment_mode synonyms — manual', () => {
  it('normaliza "manual" → "manual"', () => {
    const out = normalizeAiConfigPartial({
      rounds: [{ round_number: 1, tee_assignment_mode: 'manual' }],
    })
    expect(((out as { rounds: Array<{ tee_assignment_mode: string }> }).rounds)[0].tee_assignment_mode).toBe('manual')
  })
  it('normaliza "por_admin" → "manual"', () => {
    const out = normalizeAiConfigPartial({
      rounds: [{ round_number: 1, tee_assignment_mode: 'por_admin' }],
    })
    expect(((out as { rounds: Array<{ tee_assignment_mode: string }> }).rounds)[0].tee_assignment_mode).toBe('manual')
  })
  it('normaliza "asignacion_manual" → "manual"', () => {
    const out = normalizeAiConfigPartial({
      rounds: [{ round_number: 1, tee_assignment_mode: 'asignacion_manual' }],
    })
    expect(((out as { rounds: Array<{ tee_assignment_mode: string }> }).rounds)[0].tee_assignment_mode).toBe('manual')
  })
})

describe('handicap de juego y handicap_diff retirado', () => {
  it('hcp_pct como texto ("85", "85%", "85 %") → número, y valida', () => {
    for (const v of ['85', '85%', '85 %']) {
      const out = normalizeAiConfigPartial({ hcp_pct: v }) as { hcp_pct: unknown }
      expect(out.hcp_pct).toBe(85)
      expect(tournamentConfigPartialSchema.safeParse(out).success).toBe(true)
    }
  })
  it('hcp_pct fuera de las opciones no valida', () => {
    expect(tournamentConfigPartialSchema.safeParse(normalizeAiConfigPartial({ hcp_pct: '70' })).success).toBe(false)
  })
  it('match_play_config.handicap_diff de la IA se descarta', () => {
    const out = normalizeAiConfigPartial({
      match_play_config: { bracket_mode: 'one_vs_one', handicap_diff: '3/4' },
    }) as { match_play_config: Record<string, unknown> }
    expect('handicap_diff' in out.match_play_config).toBe(false)
    expect(out.match_play_config.bracket_mode).toBe('one_vs_one')
  })
})
