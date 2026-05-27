import { describe, it, expect } from 'vitest'
import { mapPrizeForInsert } from './prizes'
import { prizeConfigSchema } from '@/lib/draft/schema'
import type { PrizeConfig, TournamentFormat } from '@/lib/draft/types'

function prize(over: Partial<PrizeConfig> & { id: string; type: PrizeConfig['type'] }): PrizeConfig {
  return {
    description: over.description ?? 'Premio',
    ...over,
  } as PrizeConfig
}

const TID = 'tour-uuid'

describe('mapPrizeForInsert — escala gross/neto del premio', () => {
  it('persiste kind=gross para category_position en torneo no-match-play', () => {
    const row = mapPrizeForInsert(
      prize({ id: '1', type: 'category_position', position: 1, kind: 'gross' }),
      TID,
      'stroke_play',
    )
    expect(row.kind).toBe('gross')
    expect(row.tournament_id).toBe(TID)
    expect(row.type).toBe('category_position')
  })

  it('persiste kind=neto para category_position en torneo no-match-play', () => {
    const row = mapPrizeForInsert(
      prize({ id: '2', type: 'category_position', position: 2, kind: 'neto' }),
      TID,
      'stableford',
    )
    expect(row.kind).toBe('neto')
  })

  it('kind = null cuando category_position no tiene kind definido', () => {
    const row = mapPrizeForInsert(
      prize({ id: '3', type: 'category_position', position: 1 }),
      TID,
      'stroke_play',
    )
    expect(row.kind).toBeNull()
  })

  it('Match Play descarta kind aunque el organizador lo haya definido', () => {
    const row = mapPrizeForInsert(
      prize({ id: '4', type: 'category_position', position: 1, kind: 'gross' }),
      TID,
      'match_play',
    )
    expect(row.kind).toBeNull()
  })

  it.each<PrizeConfig['type']>(['closest_to_pin', 'long_drive', 'special'])(
    'kind = null para tipo no ranking-based "%s" aunque venga definido',
    (type) => {
      const row = mapPrizeForInsert(
        prize({ id: '5', type, kind: 'gross', hole_number: 9 }),
        TID,
        'stroke_play',
      )
      expect(row.kind).toBeNull()
    },
  )

  it('preserva position y hole_number tal cual', () => {
    const row = mapPrizeForInsert(
      prize({ id: '6', type: 'closest_to_pin', hole_number: 17 }),
      TID,
      'stroke_play',
    )
    expect(row.hole_number).toBe(17)
  })

  it.each<TournamentFormat>(['stroke_play', 'stableford', 'best_ball', 'scramble', 'foursome'])(
    'todos los formatos no-match-play permiten kind en category_position',
    (format) => {
      const row = mapPrizeForInsert(
        prize({ id: '7', type: 'category_position', position: 1, kind: 'neto' }),
        TID,
        format,
      )
      expect(row.kind).toBe('neto')
    },
  )
})

describe('prizeConfigSchema — round-trip de kind por zod (post-review)', () => {
  // Bug del review: zod en strip-mode quitaba `kind` antes de llegar a
  // mapPrizeForInsert. La feature quedaba silenciosamente rota en prod
  // aunque los tests unitarios pasaran. Estos tests previenen la regresión.

  it('preserva kind=gross al parsear', () => {
    const parsed = prizeConfigSchema.parse({
      id: 'p1',
      type: 'category_position',
      description: '1° Gross',
      position: 1,
      kind: 'gross',
    })
    expect(parsed.kind).toBe('gross')
  })

  it('preserva kind=neto al parsear', () => {
    const parsed = prizeConfigSchema.parse({
      id: 'p2',
      type: 'category_position',
      description: '1° Neto',
      position: 1,
      kind: 'neto',
    })
    expect(parsed.kind).toBe('neto')
  })

  it('permite kind ausente (undefined)', () => {
    const parsed = prizeConfigSchema.parse({
      id: 'p3',
      type: 'category_position',
      description: 'Sin kind',
      position: 1,
    })
    expect(parsed.kind).toBeUndefined()
  })

  it('rechaza kind con valor no permitido', () => {
    expect(() => prizeConfigSchema.parse({
      id: 'p4',
      type: 'category_position',
      description: 'Inválido',
      position: 1,
      kind: 'mixed' as unknown as 'gross' | 'neto',
    })).toThrow()
  })

  it('round-trip parse → mapPrizeForInsert preserva kind', () => {
    const raw = {
      id: 'p5',
      type: 'category_position' as const,
      description: '2° Gross',
      position: 2,
      kind: 'gross' as const,
    }
    const parsed = prizeConfigSchema.parse(raw)
    const row = mapPrizeForInsert(parsed, TID, 'stroke_play')
    expect(row.kind).toBe('gross')
  })
})
