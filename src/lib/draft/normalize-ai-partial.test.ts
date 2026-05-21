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
