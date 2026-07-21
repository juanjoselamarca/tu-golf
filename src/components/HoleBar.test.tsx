// Tests para HoleBar — focus en regression del bug del inbox 4633254e:
// "Los colores de la barra no son coherentes con la ronda".
//
// Root cause: cuando los pares por hoyo no estaban disponibles (cache aún sin
// hidratar al render colapsado del historial), `getP` caía a default `par=4`
// produciendo colores erróneos para hoyos par 3 y par 5. Ahora se rinde
// neutro (gris-par) si no hay dato confiable de par para ese hoyo.

import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import HoleBar from './HoleBar'
import { GARMIN_COLORS } from './ScoreSymbol'

function hexToRgb(hex: string): string {
  if (hex === 'transparent' || hex === '') return hex
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) return hex.toLowerCase()
  const n = parseInt(m[1], 16)
  return `rgb(${(n >> 16) & 0xff}, ${(n >> 8) & 0xff}, ${n & 0xff})`
}

function getSegmentColors(container: HTMLElement): string[] {
  const segs = Array.from(container.querySelectorAll('div > div'))
  // Normalizar a rgb() para evitar diferencias hex/rgb entre browsers y jsdom.
  return segs.map(s => (s as HTMLElement).style.background).filter(Boolean).map(hexToRgb)
}

// Par = neutro (Garmin real: birdie celeste, par neutro). Antes era verde #86EFAC
// bajo un error de dominio de DESIGN.md; corregido en la pasada de elegancia del scorer.
const COLOR_PAR = hexToRgb('#b4bcc7')
// Gris neutro: solo cuando NO hay dato confiable de par para el hoyo.
const COLOR_NO_DATA = hexToRgb('#d0d5dc')
const COLOR_BIRDIE = hexToRgb(GARMIN_COLORS.birdie)
const COLOR_BOGEY = hexToRgb(GARMIN_COLORS.bogey)

describe('HoleBar (regression: inbox 4633254e)', () => {
  // Ronda Los Leones 12 may 2026: par 4-4-3-5-4-3-4-4-5 (total 36), scores 4-3-3-5-5-4-5-4-5 (total 38).
  // Esperado: par, BIRDIE, par, par, BOGEY, BOGEY, BOGEY, par, par.
  const losLeonesPars = { '1': 4, '2': 4, '3': 3, '4': 5, '5': 4, '6': 3, '7': 4, '8': 4, '9': 5 }
  const losLeonesScores = [4, 3, 3, 5, 5, 4, 5, 4, 5]

  it('renderiza colores correctos cuando se pasa par_per_hole real', () => {
    const { container } = render(
      <HoleBar scores={losLeonesScores} pars={losLeonesPars} totalHoles={9} fillTo18={false} />,
    )
    const colors = getSegmentColors(container)
    expect(colors).toHaveLength(9)
    // Hoyo 1: 4 vs par 4 → par (gris)
    expect(colors[0]).toBe(COLOR_PAR)
    // Hoyo 2: 3 vs par 4 → birdie (azul)
    expect(colors[1]).toBe(COLOR_BIRDIE)
    // Hoyo 3: 3 vs par 3 → par
    expect(colors[2]).toBe(COLOR_PAR)
    // Hoyo 4: 5 vs par 5 → par
    expect(colors[3]).toBe(COLOR_PAR)
    // Hoyo 5: 5 vs par 4 → bogey
    expect(colors[4]).toBe(COLOR_BOGEY)
    // Hoyo 6: 4 vs par 3 → bogey
    expect(colors[5]).toBe(COLOR_BOGEY)
    // Hoyo 7: 5 vs par 4 → bogey
    expect(colors[6]).toBe(COLOR_BOGEY)
    // Hoyo 8: 4 vs par 4 → par
    expect(colors[7]).toBe(COLOR_PAR)
    // Hoyo 9: 5 vs par 5 → par
    expect(colors[8]).toBe(COLOR_PAR)
  })

  it('cuando NO hay par confiable, renderiza gris neutro en vez de asumir par=4 (regression bug)', () => {
    // Pre-fix: con pars={} se asumía par=4 → hoyo 3 par real 3 con score 3
    // se mostraba como BIRDIE (azul), incoherente con la ronda real.
    // Post-fix: pars vacíos → todos gris neutro, NO verde (porque no sabemos si era par real).
    const { container } = render(
      <HoleBar scores={losLeonesScores} pars={{}} totalHoles={9} fillTo18={false} />,
    )
    const colors = getSegmentColors(container)
    expect(colors).toHaveLength(9)
    for (const c of colors) {
      expect(c).toBe(COLOR_NO_DATA)
    }
  })

  it('pares parciales: hoyos con dato muestran color real, hoyos sin dato muestran neutro', () => {
    // Solo el cache trae pares de hoyos 1-3 (caso del courseParCache parcial)
    const partialPars = { '1': 4, '2': 4, '3': 3 }
    const { container } = render(
      <HoleBar scores={losLeonesScores} pars={partialPars} totalHoles={9} fillTo18={false} />,
    )
    const colors = getSegmentColors(container)
    expect(colors).toHaveLength(9)
    // H1: 4 vs par 4 → par (verde)
    expect(colors[0]).toBe(COLOR_PAR)
    // H2: 3 vs par 4 → birdie
    expect(colors[1]).toBe(COLOR_BIRDIE)
    // H3: 3 vs par 3 → par (verde)
    expect(colors[2]).toBe(COLOR_PAR)
    // H4..H9 sin dato de par → gris neutro (no asumir que es par)
    for (let i = 3; i < 9; i++) {
      expect(colors[i]).toBe(COLOR_NO_DATA)
    }
  })

  it('pares como array indexed by 0 funciona equivalente al record por hoyo', () => {
    const parsArr = [4, 4, 3, 5, 4, 3, 4, 4, 5]
    const { container } = render(
      <HoleBar scores={losLeonesScores} pars={parsArr} totalHoles={9} fillTo18={false} />,
    )
    const colors = getSegmentColors(container)
    expect(colors[1]).toBe(COLOR_BIRDIE) // H2: 3 vs par 4
    expect(colors[4]).toBe(COLOR_BOGEY)  // H5: 5 vs par 4
    expect(colors[6]).toBe(COLOR_BOGEY)  // H7: 5 vs par 4
  })

  it('hoyos sin score quedan transparentes (no se asume nada)', () => {
    const scoresWithGap: (number | null)[] = [4, 3, null, 5, 5, 4, 5, 4, 5]
    const { container } = render(
      <HoleBar scores={scoresWithGap} pars={losLeonesPars} totalHoles={9} fillTo18={false} />,
    )
    const colors = getSegmentColors(container)
    expect(colors[2]).toBe('transparent')
  })
})
