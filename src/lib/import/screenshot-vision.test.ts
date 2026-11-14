import { describe, expect, it } from 'vitest'
import { fixActivityRound, type VisionActivityRound } from './screenshot-vision'

const ronda = (p: Partial<VisionActivityRound>): VisionActivityRound => ({
  course_name: 'Cancha',
  played_at: '2026-11-01',
  total_gross: 45,
  vs_par: 0,
  holes_played: 9,
  color_sequence: Array(9).fill('green'),
  confidence: 0.9,
  ...p,
})

describe('fixActivityRound (correcciones a la lectura de la IA)', () => {
  it('más de 60 golpes marcados como 9 hoyos pasan a 18 y recalcula vs par', () => {
    const r = fixActivityRound(ronda({ total_gross: 80, holes_played: 9, color_sequence: Array(18).fill('gold') }))
    expect(r.holes_played).toBe(18)
    expect(r.vs_par).toBe(8)
    expect(r.color_sequence).toHaveLength(18)
  })

  it('60 o menos marcados como 18 hoyos pasan a 9', () => {
    const r = fixActivityRound(ronda({ total_gross: 48, holes_played: 18 }))
    expect(r.holes_played).toBe(9)
    expect(r.vs_par).toBe(12)
  })

  it('secuencia de colores duplicada se corta a la mitad', () => {
    const seq = [...Array(9).fill('green'), ...Array(9).fill('red')]
    const r = fixActivityRound(ronda({ color_sequence: seq }))
    expect(r.color_sequence).toEqual(Array(9).fill('green'))
  })

  it('secuencia corta se rellena con dorado (bogey) hasta los hoyos jugados', () => {
    const r = fixActivityRound(ronda({ color_sequence: Array(7).fill('green') }))
    expect(r.color_sequence).toEqual([...Array(7).fill('green'), 'gold', 'gold'])
  })
})
