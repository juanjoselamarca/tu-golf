import { describe, it, expect } from 'vitest'
import {
  getScoreColor,
  getScoreColorLight,
  getScoreResult,
  SCORE_STYLES,
  SCORE_STYLES_LIGHT,
  GARMIN_COLOR_TO_DIFF,
  colorToDiff,
  isAmbiguousColor,
} from './colors'

describe('getScoreColor — paleta Garmin canónica (dark)', () => {
  it('eagle o mejor (diff <= -2) → azul oscuro #0B6BA6', () => {
    expect(getScoreColor(-2)).toBe('#0B6BA6')
    expect(getScoreColor(-3)).toBe('#0B6BA6')
    expect(getScoreColor(-10)).toBe('#0B6BA6')
  })

  it('birdie (diff === -1) → celeste #14B3D9', () => {
    expect(getScoreColor(-1)).toBe('#14B3D9')
  })

  it('par (diff === 0) → muted white', () => {
    expect(getScoreColor(0)).toBe(SCORE_STYLES.par.textColor)
  })

  it('bogey (diff === +1) → dorado #D4A442', () => {
    expect(getScoreColor(1)).toBe('#D4A442')
  })

  it('doble bogey o peor (diff >= +2) → rojo #dc2626', () => {
    expect(getScoreColor(2)).toBe('#dc2626')
    expect(getScoreColor(5)).toBe('#dc2626')
    expect(getScoreColor(20)).toBe('#dc2626')
  })

  it('NO retorna colores Tailwind genéricos (anti-regresión)', () => {
    // El bug histórico era usar #16a34a (verde Tailwind) para birdie.
    expect(getScoreColor(-1)).not.toBe('#16a34a')
    expect(getScoreColor(-1)).not.toBe('#22c55e')
    // Y #c8a55a (gold legacy) para eagle.
    expect(getScoreColor(-2)).not.toBe('#c8a55a')
  })
})

describe('getScoreColorLight — variante para fondos blancos', () => {
  it('eagle o mejor → mismo azul oscuro (contraste suficiente)', () => {
    expect(getScoreColorLight(-3)).toBe(SCORE_STYLES_LIGHT.eagle_or_better.textColor)
    expect(getScoreColorLight(-3)).toBe('#0B6BA6')
  })

  it('birdie → cyan más profundo para contraste sobre blanco', () => {
    expect(getScoreColorLight(-1)).toBe(SCORE_STYLES_LIGHT.birdie.textColor)
    expect(getScoreColorLight(-1)).toBe('#0e8a9e')
  })

  it('par → gris medio legible en blanco', () => {
    expect(getScoreColorLight(0)).toBe('#6b7280')
  })

  it('bogey → naranja oscuro legible en blanco', () => {
    expect(getScoreColorLight(1)).toBe('#92700e')
  })

  it('doble+ → rojo oscuro para contraste', () => {
    expect(getScoreColorLight(3)).toBe('#991b1b')
  })

  it('NO usa Tailwind green/red genéricos para under/over par', () => {
    expect(getScoreColorLight(-1)).not.toBe('#16a34a')
    expect(getScoreColorLight(1)).not.toBe('#dc2626')
  })
})

describe('getScoreResult — categorización vs par', () => {
  it('mapea gross vs par a las 5 categorías Garmin', () => {
    expect(getScoreResult(2, 4)).toBe('eagle_or_better')
    expect(getScoreResult(3, 4)).toBe('birdie')
    expect(getScoreResult(4, 4)).toBe('par')
    expect(getScoreResult(5, 4)).toBe('bogey')
    expect(getScoreResult(6, 4)).toBe('double_or_worse')
    expect(getScoreResult(null, 4)).toBe('no_score')
  })
})

describe('colorToDiff — parseo de Garmin export', () => {
  it('mapea color names a diferencial vs par', () => {
    expect(colorToDiff('dark_blue')).toBe(-2)
    expect(colorToDiff('light_blue')).toBe(-1)
    expect(colorToDiff('gold')).toBe(1)
  })

  it('normaliza variantes de separadores (case insensitive, _/-)', () => {
    expect(colorToDiff('DARK-BLUE')).toBe(-2)
    expect(colorToDiff('dark_blue')).toBe(-2)
    expect(colorToDiff('Dark_Blue')).toBe(-2)
  })

  it('retorna 0 para colores desconocidos (fallback par)', () => {
    expect(colorToDiff('unknown')).toBe(0)
  })
})

describe('isAmbiguousColor', () => {
  it('red es ambiguo (puede ser bogey o doble)', () => {
    expect(isAmbiguousColor('red')).toBe(true)
    expect(isAmbiguousColor('RED')).toBe(true)
  })

  it('azules y dorado no son ambiguos', () => {
    expect(isAmbiguousColor('dark_blue')).toBe(false)
    expect(isAmbiguousColor('light_blue')).toBe(false)
    expect(isAmbiguousColor('gold')).toBe(false)
  })
})

describe('GARMIN_COLOR_TO_DIFF — tabla de referencia', () => {
  it('cubre los 5 colores Garmin oficiales', () => {
    expect(GARMIN_COLOR_TO_DIFF.dark_blue).toBe(-2)
    expect(GARMIN_COLOR_TO_DIFF.light_blue).toBe(-1)
    expect(GARMIN_COLOR_TO_DIFF.gold).toBe(1)
  })
})
