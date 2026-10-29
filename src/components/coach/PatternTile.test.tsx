import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PatternTile } from './PatternTile'

const base = { name: 'Tilt tras doble bogey', score: 72, scoreSuffix: '/100', footMeta: '6 rondas · 80% conf' }

describe('PatternTile — contraste del estado latente', () => {
  it('latente no apaga el mosaico con opacity (el nombre y el pie quedaban bajo 4.5:1)', () => {
    const { container } = render(<PatternTile {...base} category="mental" state="latente" spark={[]} />)
    const tile = container.firstElementChild as HTMLElement
    expect(tile.style.opacity === '' || tile.style.opacity === '1').toBe(true)
    expect(screen.getByText('Tilt tras doble bogey').style.color).toBe('var(--text-2)')
    expect(screen.getByText(/Mental · latente/).style.color).toBe('var(--coach-pattern-latente)')
  })

  it('activo usa el color de la categoría y el texto principal', () => {
    render(<PatternTile {...base} category="mental" state="active" spark={[{ height: 50 }]} />)
    expect(screen.getByText(/Mental · activo/).style.color).toBe('var(--coach-pattern-mental)')
    expect(screen.getByText('Tilt tras doble bogey').style.color).toBe('var(--text)')
  })

  it('no ofrece "ver →": no existe un detalle de patrón al que llevar (dead-end 25-oct)', () => {
    render(<PatternTile {...base} category="mental" state="active" spark={[{ height: 50 }]} />)
    expect(screen.queryByText(/ver →/)).toBeNull()
    expect(screen.getByText('6 rondas · 80% conf')).toBeTruthy()
  })
})

// Tokens de texto de 9.5px: deben pasar AA (4.5:1) sobre --bg-surface de cada tema.
describe('tokens --coach-pattern-* (globals.css)', () => {
  const css = readFileSync(join(process.cwd(), 'src/app/globals.css'), 'utf-8')
  const hex = (h: string) => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
  const lum = (h: string) => {
    const [r, g, b] = hex(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 })
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const ratio = (a: string, b: string) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05) }
  const darkStart = css.indexOf('[data-theme="dark"] {')
  const valor = (token: string, desde: number) => {
    const m = new RegExp(`--${token}:\\s*(#[0-9A-Fa-f]{6})`).exec(css.slice(desde))
    if (!m) throw new Error(`falta --${token}`)
    return m[1]
  }

  for (const token of ['coach-pattern-mental', 'coach-pattern-cancha', 'coach-pattern-latente']) {
    it(`${token} ≥ 4.5:1 en claro y oscuro`, () => {
      expect(darkStart).toBeGreaterThan(0)
      expect(ratio(valor(token, 0), '#ffffff')).toBeGreaterThanOrEqual(4.5)
      expect(ratio(valor(token, darkStart), valor('bg-surface', darkStart))).toBeGreaterThanOrEqual(4.5)
    })
  }
})
