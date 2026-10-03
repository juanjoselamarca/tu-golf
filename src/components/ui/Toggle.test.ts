/**
 * Contraste WCAG 1.4.11 (componentes no textuales, ≥3:1) del Toggle, MEDIDO
 * contra los tokens reales de globals.css en claro y oscuro. Lee los tokens
 * que el componente usa (TOGGLE_TOKENS), no una copia: si alguien cambia el
 * token del Toggle o el valor del token en globals.css, este test lo mide.
 * Los colores con alpha se compositan sobre el fondo antes de medir.
 */
import { describe, it, expect } from 'vitest'
import * as fs from 'node:fs'
import * as path from 'node:path'
import { TOGGLE_TOKENS } from './Toggle'

const CSS = fs.readFileSync(path.resolve(__dirname, '../../app/globals.css'), 'utf8')

type RGBA = [number, number, number, number]

function bloque(selector: string): string {
  const i = CSS.indexOf(`\n${selector} {`)
  if (i < 0) throw new Error(`No encontré el bloque ${selector} en globals.css`)
  return CSS.slice(i, CSS.indexOf('\n}', i))
}

function token(tema: 'light' | 'dark', nombre: string): string {
  const re = new RegExp(`${nombre.replace(/-/g, '\-')}\s*:\s*([^;]+);`)
  const v = bloque(`[data-theme="${tema}"]`).match(re)?.[1] ?? bloque(':root').match(re)?.[1]
  if (!v) throw new Error(`Token ${nombre} no definido para ${tema}`)
  return v.trim()
}

function parse(c: string): RGBA {
  const hex = c.match(/^#([0-9a-f]{6})$/i)
  if (hex) return [0, 2, 4].map((k) => parseInt(hex[1].slice(k, k + 2), 16)).concat(1) as RGBA
  const rgb = c.match(/^rgba?\(([^)]+)\)$/)
  if (rgb) {
    const [r, g, b, a = '1'] = rgb[1].split(',').map((s) => s.trim())
    return [Number(r), Number(g), Number(b), Number(a)]
  }
  throw new Error(`Color no soportado: ${c}`)
}

/** Compone `fg` (posible alpha) sobre `bg` opaco. */
function sobre(fg: RGBA, bg: RGBA): RGBA {
  const a = fg[3]
  return [0, 1, 2].map((k) => fg[k] * a + bg[k] * (1 - a)).concat(1) as RGBA
}

function luminancia([r, g, b]: RGBA): number {
  const lin = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

function contraste(a: RGBA, b: RGBA): number {
  const [l1, l2] = [luminancia(a), luminancia(b)].sort((x, y) => y - x)
  return (l1 + 0.05) / (l2 + 0.05)
}

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
