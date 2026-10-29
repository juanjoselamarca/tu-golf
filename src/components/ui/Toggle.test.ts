/**
 * Contraste WCAG 1.4.11 (componentes no textuales, ≥3:1) del Toggle, MEDIDO
 * contra los tokens reales de globals.css en claro y oscuro. Lee los tokens
 * que el componente usa (TOGGLE_TOKENS), no una copia: si alguien cambia el
 * token del Toggle o el valor del token en globals.css, este test lo mide.
 * Los colores con alpha se compositan sobre el fondo antes de medir. La
 * matemática y la lectura de tokens viven en `src/__tests__/helpers/contraste-tema.ts`
 * (las comparte con los avatares del borrador, que tenían el mismo problema).
 */
import { describe, it, expect } from 'vitest'
import { contraste, parse, sobre, token } from '@/__tests__/helpers/contraste-tema'
import { TOGGLE_TOKENS } from './Toggle'

const FONDOS = ['--bg', '--bg-surface', '--bg-card-light'] as const

describe.each(['light', 'dark'] as const)('Toggle WCAG 1.4.11 — tema %s', (tema) => {
  const color = (t: string) => parse(token(tema, t))

  for (const fondo of FONDOS) {
    for (const estado of ['trackOff', 'trackOn'] as const) {
      it(`pista ${estado === 'trackOn' ? 'ON' : 'OFF'} vs ${fondo} ≥ 3:1`, () => {
        const bg = color(fondo)
        const pista = sobre(color(TOGGLE_TOKENS[estado]), bg)
        expect(contraste(pista, bg)).toBeGreaterThanOrEqual(3)
      })
      it(`thumb vs pista ${estado === 'trackOn' ? 'ON' : 'OFF'} (sobre ${fondo}) ≥ 3:1`, () => {
        const bg = color(fondo)
        const pista = sobre(color(TOGGLE_TOKENS[estado]), bg)
        const thumb = sobre(color(TOGGLE_TOKENS.thumb), pista)
        expect(contraste(thumb, pista)).toBeGreaterThanOrEqual(3)
      })
    }
  }
})

describe('medición sanity', () => {
  it('la pista OFF anterior (--border-md compositado) reprobaba en claro (~1.3:1)', () => {
    const bg = parse(token('light', '--bg'))
    const vieja = sobre(parse(token('light', '--border-md')), bg)
    expect(contraste(vieja, bg)).toBeLessThan(1.5)
  })
})
