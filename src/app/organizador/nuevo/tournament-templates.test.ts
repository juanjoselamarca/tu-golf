import { describe, it, expect } from 'vitest'
import { createInitialConfig } from '@/lib/draft/initial-config'
import { KNOWN_FORMAT_KEYS } from '@/golf/formats'
import { TOURNAMENT_TEMPLATES, templateToPartial } from './tournament-templates'

const scramble18 = TOURNAMENT_TEMPLATES.find((t) => t.format === 'scramble')!

describe('TOURNAMENT_TEMPLATES', () => {
  it('todas las plantillas usan formatos del registry canónico', () => {
    for (const t of TOURNAMENT_TEMPLATES) {
      expect(KNOWN_FORMAT_KEYS).toContain(t.format)
    }
  })
})

describe('templateToPartial', () => {
  it('fija formato y modo', () => {
    const config = createInitialConfig()
    const partial = templateToPartial(scramble18, config)
    expect(partial.format).toBe('scramble')
    expect(partial.modo).toBe('neto')
  })

  it('no toca las rondas si la primera ya tiene los hoyos de la plantilla', () => {
    const config = createInitialConfig()
    config.rounds = [{ ...config.rounds[0], hole_count: 18 }]
    expect(templateToPartial(scramble18, config).rounds).toBeUndefined()
  })

  it('ajusta SOLO la primera ronda cuando difiere en hoyos', () => {
    const config = createInitialConfig()
    const r0 = { ...config.rounds[0], round_number: 1, hole_count: 9 as const }
    const r1 = { ...config.rounds[0], round_number: 2, hole_count: 9 as const }
    config.rounds = [r0, r1]
    const partial = templateToPartial(scramble18, config)
    expect(partial.rounds?.map((r) => r.hole_count)).toEqual([18, 9])
  })

  it('sin rondas, no inventa una', () => {
    const config = createInitialConfig()
    config.rounds = []
    expect(templateToPartial(scramble18, config).rounds).toBeUndefined()
  })
})
