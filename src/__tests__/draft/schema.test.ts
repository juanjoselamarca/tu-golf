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

  // zod descarta las keys que el schema no declara. `description` no estaba:
  // el textarea del wizard se tipeaba, el PATCH la perdía y la respuesta del
  // autosave la borraba de la pantalla (inbox c894c74c, en la descripción).
  it('conserva description (vacía también) y la limita a 500', () => {
    const base = { schema_version: 1, name: 'X', format: 'stroke_play', modo: 'gross', use_handicap: false, categories: [], rounds: [], registration: { mode: 'open_with_code' }, prizes: [], is_practice: false, pending_confirmations: [], date_start: null, cover_image_url: null }
    const parsed = tournamentConfigSchema.safeParse({ ...base, description: 'Cuota $20.000' })
    expect(parsed.success && parsed.data.description).toBe('Cuota $20.000')
    expect(tournamentConfigSchema.safeParse({ ...base, description: '' }).success).toBe(true)
    expect(tournamentConfigSchema.safeParse({ ...base, description: 'x'.repeat(501) }).success).toBe(false)
  })
})

describe('tournamentConfigPartialSchema', () => {
  it('acepta partial con solo format', () => {
    expect(tournamentConfigPartialSchema.safeParse({ format: 'scramble' }).success).toBe(true)
  })

  // Borrar un campo opcional viaja como null (undefined no sobrevive a JSON).
  it('acepta null en los opcionales que el wizard borra (registration y prizes)', () => {
    const parsed = tournamentConfigPartialSchema.safeParse({
      registration: { max_players: null, deadline: null },
      prizes: [{ id: 'p1', category_id: null, position: null, hole_number: null, kind: null }],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.registration).toEqual({ max_players: null, deadline: null })
    expect(parsed.success && parsed.data.prizes?.[0]).toEqual({
      id: 'p1',
      category_id: null,
      position: null,
      hole_number: null,
      kind: null,
    })
  })

  it('el schema completo también persiste esos null (local y server iguales)', () => {
    const base = { schema_version: 1, name: 'X', format: 'stroke_play', modo: 'gross', use_handicap: false, categories: [], rounds: [], is_practice: false, pending_confirmations: [], date_start: null, cover_image_url: null }
    const parsed = tournamentConfigSchema.safeParse({
      ...base,
      registration: { mode: 'open_with_code', max_players: null },
      prizes: [{ id: 'p1', type: 'special', description: 'Hoyo en uno', hole_number: null, kind: null }],
    })
    expect(parsed.success).toBe(true)
    expect(parsed.success && parsed.data.registration.max_players).toBeNull()
  })

  it('description viaja en el partial del autosave', () => {
    const parsed = tournamentConfigPartialSchema.safeParse({ description: 'Código de vestimenta' })
    expect(parsed.success && parsed.data.description).toBe('Código de vestimenta')
  })

  it('rechaza format inválido', () => {
    expect(tournamentConfigPartialSchema.safeParse({ format: 'inventado' }).success).toBe(false)
  })
})
