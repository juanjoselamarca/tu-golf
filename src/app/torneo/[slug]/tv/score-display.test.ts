import { describe, it, expect } from 'vitest'
import {
  scoreLabelFor,
  scoreTotalFor,
  primaryScoreText,
  primaryScoreColor,
  secondaryScoreText,
} from './score-display'

// Mismas funciones que usa la pantalla.
const fmtVsPar = (n: number): string => (n === 0 ? 'E' : n > 0 ? `+${n}` : String(n))
const scoreColor = (diff: number): string => {
  if (diff <= -2) return '#3b82f6'
  if (diff === -1) return '#22c55e'
  if (diff === 0) return '#edeae4'
  if (diff === 1) return '#c4992a'
  return '#dc2626'
}

const STABLEFORD = { modo_juego: 'neto', formato_juego: 'stableford' } as const
const NETO = { modo_juego: 'neto', formato_juego: 'stroke_play' } as const
const GROSS = { modo_juego: 'gross', formato_juego: 'stroke_play' } as const

// Líder de stableford: 27 puntos. Su `vsPar` del motor ES el total de puntos.
const lider = { vsPar: 27, stablefordTotal: 27, grossTotal: 90, netTotal: 72 }

describe('TV · stableford no se pinta con la regla de stroke play', () => {
  it('el número grande son los puntos pelados, sin signo', () => {
    expect(primaryScoreText(lider, STABLEFORD, fmtVsPar)).toBe('27')
  })

  it('el líder NO sale en rojo (la escala de golpes asume que menos es mejor)', () => {
    expect(primaryScoreColor(lider, STABLEFORD, scoreColor)).not.toBe('#dc2626')
  })

  it('un jugador en 0 puntos no muestra "E"', () => {
    expect(primaryScoreText({ vsPar: 0, stablefordTotal: 0 }, STABLEFORD, fmtVsPar)).toBe('0')
  })

  it('no repite el mismo número abajo', () => {
    expect(secondaryScoreText(lider, STABLEFORD)).toBeNull()
  })

  it('la columna se rotula Puntos', () => {
    expect(scoreLabelFor(STABLEFORD)).toBe('Puntos')
  })
})

describe('TV · stroke play sigue igual', () => {
  const p = { vsPar: -2, grossTotal: 70, netTotal: 68 }

  it('neto: delta arriba, golpes netos abajo', () => {
    expect(primaryScoreText(p, NETO, fmtVsPar)).toBe('-2')
    expect(primaryScoreColor(p, NETO, scoreColor)).toBe('#3b82f6')
    expect(secondaryScoreText(p, NETO)).toBe('68')
    expect(scoreLabelFor(NETO)).toBe('Score (net)')
  })

  it('gross: el total de abajo son los golpes brutos', () => {
    expect(secondaryScoreText(p, GROSS)).toBe('70')
    expect(scoreTotalFor(p, GROSS)).toBe(70)
    expect(scoreLabelFor(GROSS)).toBe('Score (gross)')
  })

  it('en par muestra E', () => {
    expect(primaryScoreText({ vsPar: 0, grossTotal: 72, netTotal: 72 }, GROSS, fmtVsPar)).toBe('E')
  })
})
