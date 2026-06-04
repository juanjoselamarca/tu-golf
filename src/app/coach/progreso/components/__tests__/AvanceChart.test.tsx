import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { AvanceChart, type PuntoSerie } from '../AvanceChart'

function pt(played_at: string, delta: number, holes: 9 | 18): PuntoSerie {
  return { played_at, delta_vs_handicap_expected: delta, holes_played: holes }
}

// Serie mixta: 4 rondas de 18h + 2 de 9h interpoladas.
const MIXTA: PuntoSerie[] = [
  pt('2026-01-10', 8, 18),
  pt('2026-02-05', 6, 18),
  pt('2026-02-20', -7, 9),
  pt('2026-03-15', 5, 18),
  pt('2026-04-02', -8, 9),
  pt('2026-04-28', 3, 18),
]

describe('AvanceChart — render real con datos mixtos 9h/18h', () => {
  it('dibuja la tendencia, marca las 9h huecas y muestra la leyenda', () => {
    const { container } = render(
      <AvanceChart serie={MIXTA} currentHandicap={9.6} targetHandicap={7} />,
    )
    // SVG del gráfico (no la leyenda).
    const chart = container.querySelector('svg[role="img"]')!
    expect(chart).not.toBeNull()
    // Tendencia: una línea gruesa (stroke-width 2.5).
    const trend = chart.querySelector('path[stroke-width="2.5"]')
    expect(trend).not.toBeNull()
    expect(trend!.getAttribute('d')).toMatch(/^M /)

    // 9h = puntos HUECOS (fill bg-surface) dentro del gráfico. Hay 2 rondas de 9h.
    const huecos = chart.querySelectorAll('circle[fill="var(--bg-surface)"]')
    expect(huecos.length).toBe(2)

    // Líneas de referencia + leyenda + footer.
    const txt = container.textContent ?? ''
    expect(txt).toContain('meta 7')
    expect(txt).toContain('hcp 9.6')
    expect(txt).toContain('9 hoyos')
    expect(txt).toContain('18 hoyos')
    expect(txt).toContain('dif')
    expect(txt).toContain('equiv. 18h')
  })

  it('sin meta: no dibuja línea de meta pero sí la de handicap', () => {
    const { container } = render(<AvanceChart serie={MIXTA} currentHandicap={9.6} targetHandicap={null} />)
    const txt = container.textContent ?? ''
    expect(txt).not.toContain('meta ')
    expect(txt).toContain('hcp 9.6')
  })

  it('menos de 2 rondas: estado vacío honesto (no dibuja gráfico)', () => {
    const { container } = render(
      <AvanceChart serie={[pt('2026-04-28', 3, 18)]} currentHandicap={9.6} targetHandicap={7} />,
    )
    expect(container.querySelector('svg')).toBeNull()
    expect(container.textContent).toMatch(/al menos 2 rondas/i)
  })

  it('jugador solo-9h: cae a tendencia sobre todas las rondas (no queda sin línea)', () => {
    const solo9 = [pt('2026-01-10', -5, 9), pt('2026-02-10', -6, 9), pt('2026-03-10', -4, 9)]
    const { container } = render(<AvanceChart serie={solo9} currentHandicap={9.6} targetHandicap={7} />)
    const chart = container.querySelector('svg[role="img"]')!
    // Igual hay una línea de tendencia (fallback) — no crashea ni queda vacío.
    expect(chart.querySelector('path[stroke-width="2.5"]')).not.toBeNull()
    // Las 3 son 9h → 3 puntos huecos en el gráfico.
    expect(chart.querySelectorAll('circle[fill="var(--bg-surface)"]').length).toBe(3)
  })

  it('sin handicap actual: estado vacío (no se puede ubicar el diferencial)', () => {
    const { container } = render(<AvanceChart serie={MIXTA} currentHandicap={null} targetHandicap={7} />)
    expect(container.querySelector('svg')).toBeNull()
  })
})
