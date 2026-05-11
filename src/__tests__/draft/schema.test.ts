// src/__tests__/draft/schema.test.ts
import { describe, it, expect } from 'vitest'
import { tournamentConfigSchema, tournamentConfigPartialSchema } from '@/lib/draft/schema'

describe('tournamentConfigSchema', () => {
  it('rechaza schema_version distinto a 1', () => {
    const bad = { schema_version: 2, name: 'X', format: 'stroke_play', modo: 'gross', use_handicap: false, categories: [], rounds: [], registration: { mode: 'open_with_code' }, prizes: [], is_practice: false, pending_confirmations: [], date_start: null, cover_image_url: null }
    expect(tournamentConfigSchema.safeParse(bad).success).toBe(false)
  })

  it('acepta config mínimo válido', () => {
    const ok = { schema_version: 1, name: 'X', format: 'stroke_play', modo: 'gross', use_handicap: false, categories: [], rounds: [], registration: { mode: 'open_with_code' }, prizes: [], is_practice: false, pending_confirmations: [], date_start: null, cover_image_url: null }
    expect(tournamentConfigSchema.safeParse(ok).success).toBe(true)
  })
})

describe('tournamentConfigPartialSchema', () => {
  it('acepta partial con solo format', () => {
    expect(tournamentConfigPartialSchema.safeParse({ format: 'scramble' }).success).toBe(true)
  })

  it('rechaza format inválido', () => {
    expect(tournamentConfigPartialSchema.safeParse({ format: 'inventado' }).success).toBe(false)
  })
})
