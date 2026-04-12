import { describe, it, expect } from 'vitest'
import {
  FORMAT_META,
  formatLabel,
  labelResultado,
  formatOverUnder,
  type FormatoJuego,
  type ModoJuego,
} from '../golf/core/rules'

describe('FORMAT_META completeness', () => {
  const allFormats: FormatoJuego[] = ['stroke_play', 'stableford', 'match_play', 'best_ball', 'scramble', 'foursome']

  it('has metadata for all 6 formats', () => {
    for (const f of allFormats) {
      expect(FORMAT_META[f]).toBeDefined()
      expect(FORMAT_META[f].label).toBeTruthy()
      expect(FORMAT_META[f].modosPermitidos.length).toBeGreaterThan(0)
    }
  })

  it('stableford only allows neto (culture Chile + R&A)', () => {
    expect(FORMAT_META.stableford.modosPermitidos).toEqual(['neto'])
  })

  it('match_play only allows neto (culture Chile)', () => {
    expect(FORMAT_META.match_play.modosPermitidos).toEqual(['neto'])
  })

  it('stroke_play allows both gross and neto', () => {
    expect(FORMAT_META.stroke_play.modosPermitidos).toContain('gross')
    expect(FORMAT_META.stroke_play.modosPermitidos).toContain('neto')
  })

  it('team formats require teams', () => {
    expect(FORMAT_META.best_ball.requiereEquipos).toBe(true)
    expect(FORMAT_META.scramble.requiereEquipos).toBe(true)
    expect(FORMAT_META.foursome.requiereEquipos).toBe(true)
  })

  it('foursome is exactly 2 players per team', () => {
    expect(FORMAT_META.foursome.jugadoresPorEquipo).toEqual({ min: 2, max: 2 })
  })

  it('match_play requires pairs', () => {
    expect(FORMAT_META.match_play.requiereParejas).toBe(true)
  })

  it('individual formats do not require teams', () => {
    expect(FORMAT_META.stroke_play.requiereEquipos).toBe(false)
    expect(FORMAT_META.stableford.requiereEquipos).toBe(false)
  })
})

describe('formatLabel', () => {
  it('stroke_play gross → Stroke Play Gross', () => {
    expect(formatLabel('stroke_play', 'gross')).toBe('Stroke Play Gross')
  })

  it('stroke_play neto → Stroke Play Neto', () => {
    expect(formatLabel('stroke_play', 'neto')).toBe('Stroke Play Neto')
  })

  it('stableford never shows Neto suffix (always neto by rule)', () => {
    expect(formatLabel('stableford', 'neto')).toBe('Stableford')
    expect(formatLabel('stableford')).toBe('Stableford')
  })

  it('match_play never shows Neto suffix (always neto by rule)', () => {
    expect(formatLabel('match_play', 'neto')).toBe('Match Play')
    expect(formatLabel('match_play')).toBe('Match Play')
  })

  it('best_ball with modo', () => {
    expect(formatLabel('best_ball', 'neto')).toBe('Best Ball Neto')
    expect(formatLabel('best_ball', 'gross')).toBe('Best Ball Gross')
  })

  it('unknown format falls back to Stroke Play', () => {
    expect(formatLabel('unknown_format')).toBe('Stroke Play')
  })

  it('no modo → just the format name', () => {
    expect(formatLabel('stroke_play')).toBe('Stroke Play')
    expect(formatLabel('scramble')).toBe('Scramble')
  })
})

describe('labelResultado', () => {
  it('maps all result types correctly', () => {
    expect(labelResultado(-3)).toBe('albatros')
    expect(labelResultado(-2)).toBe('eagle')
    expect(labelResultado(-1)).toBe('birdie')
    expect(labelResultado(0)).toBe('par')
    expect(labelResultado(1)).toBe('bogey')
    expect(labelResultado(2)).toBe('doble')
    expect(labelResultado(3)).toBe('triple+')
    expect(labelResultado(5)).toBe('triple+')
  })
})

describe('formatOverUnder', () => {
  it('even par → E', () => {
    expect(formatOverUnder(0)).toBe('E')
  })

  it('over par → +N', () => {
    expect(formatOverUnder(3)).toBe('+3')
    expect(formatOverUnder(1)).toBe('+1')
  })

  it('under par → -N', () => {
    expect(formatOverUnder(-2)).toBe('-2')
    expect(formatOverUnder(-5)).toBe('-5')
  })
})
