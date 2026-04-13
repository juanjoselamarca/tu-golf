import { describe, it, expect } from 'vitest'
import { getHoleColor, getStablefordColor } from '@/components/HoleColorBar'

describe('getHoleColor — Garmin palette', () => {
  it('eagle or better → azul oscuro Garmin', () => {
    expect(getHoleColor(-2)).toBe('#0B6BA6')
    expect(getHoleColor(-3)).toBe('#0B6BA6')
  })

  it('birdie → celeste Garmin', () => {
    expect(getHoleColor(-1)).toBe('#14B3D9')
  })

  it('par → verde', () => {
    expect(getHoleColor(0)).toBe('#4ade80')
  })

  it('bogey → dorado Garmin', () => {
    expect(getHoleColor(1)).toBe('#D4A442')
  })

  it('double bogey or worse → rojo Garmin', () => {
    expect(getHoleColor(2)).toBe('#DC3B2E')
    expect(getHoleColor(5)).toBe('#DC3B2E')
  })

  it('null score → gris transparente', () => {
    expect(getHoleColor(null)).toBe('rgba(0,0,0,0.08)')
  })
})

describe('getStablefordColor — puntos Stableford', () => {
  it('0 puntos (double+) → rojo', () => {
    expect(getStablefordColor(0)).toBe('#DC3B2E')
  })

  it('1 punto (bogey) → dorado', () => {
    expect(getStablefordColor(1)).toBe('#D4A442')
  })

  it('2 puntos (par) → verde', () => {
    expect(getStablefordColor(2)).toBe('#4ade80')
  })

  it('3+ puntos (birdie+) → celeste', () => {
    expect(getStablefordColor(3)).toBe('#14B3D9')
    expect(getStablefordColor(4)).toBe('#0B6BA6')
    expect(getStablefordColor(5)).toBe('#0B6BA6')
  })
})
