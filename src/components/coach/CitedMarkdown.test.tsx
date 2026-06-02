/**
 * Smoke tests del citador. Renderizamos a string con renderToString para
 * verificar que el HTML resultante incluye el bubble de fuente cuando
 * corresponde, y NO lo incluye cuando no.
 */

import { describe, it, expect } from 'vitest'
import { renderToString } from 'react-dom/server'
import { CitedMarkdown } from './CitedMarkdown'
import type { RoundSummary } from './RoundMiniChart'

const round: RoundSummary = {
  course_name: 'Marbella',
  played_at: '2026-04-12T00:00:00Z',
  total_gross: 85,
  scores: [4, 4, 3, 4, 5, 4, 3, 4, 5, 5, 5, 4, 5, 6, 5, 4, 4, 4],
  pars: [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 4, 5, 4, 3, 4, 5],
}

describe('CitedMarkdown', () => {
  it('inserta el chip "fuente" cuando el coach menciona el total_gross exacto', () => {
    const html = renderToString(
      <CitedMarkdown text="Tu última ronda fue de 85 golpes." round={round} />,
    )
    expect(html).toContain('85')
    expect(html).toContain('fuente')
  })

  it('NO inserta cita si no hay round disponible', () => {
    const html = renderToString(
      <CitedMarkdown text="Tu última ronda fue de 85 golpes." round={null} />,
    )
    expect(html).toContain('85')
    expect(html).not.toContain('fuente')
  })

  it('NO inserta cita si total_gross es < 30 (fuera de zona de scoring)', () => {
    const html = renderToString(
      <CitedMarkdown
        text="Tu última ronda fue de 25 golpes."
        round={{ ...round, total_gross: 25 }}
      />,
    )
    expect(html).not.toContain('fuente')
  })

  it('NO confunde 85 dentro de otro número (185, 850)', () => {
    const html = renderToString(
      <CitedMarkdown
        text="El número 850 no es tu score, pero 85 sí."
        round={round}
      />,
    )
    // Solo debería haber un chip "fuente"
    const matches = html.match(/fuente/g) ?? []
    expect(matches.length).toBe(1)
  })

  it('renderiza markdown normal cuando no hay match', () => {
    const html = renderToString(
      <CitedMarkdown text="**Trabajá** tu *swing* primero." round={round} />,
    )
    expect(html).toContain('<strong>')
    expect(html).toContain('<em>')
    expect(html).not.toContain('fuente')
  })

  // Reporte de campo 2026-06-02: tabla "plan hoyo a hoyo" ilegible en mobile
  // (columnas colapsaban letra por letra). El fix envuelve la tabla en un
  // contenedor con scroll horizontal y celdas sin wrap.
  const TABLE_MD = [
    '| Hoyo | Par | Tu promedio | Objetivo | Estrategia |',
    '|------|-----|-------------|----------|------------|',
    '| H1 | 4 | 4.5 | 4 (par) | Salida conservadora, hierro al green |',
    '| H2 | 4 | 4.8 | 5 (bogey) | Hoyo difícil — bogey es buen resultado |',
  ].join('\n')

  it('envuelve las tablas en un contenedor con scroll horizontal (mobile legible)', () => {
    const html = renderToString(<CitedMarkdown text={TABLE_MD} round={null} />)
    expect(html).toContain('<table')
    expect(html).toContain('overflow-x:auto')
    // Las celdas NO deben envolver (causa del colapso letra-por-letra).
    expect(html).toContain('white-space:nowrap')
  })

  it('aplica el render de tabla también en la rama con citas de fuente', () => {
    const html = renderToString(<CitedMarkdown text={TABLE_MD} round={round} />)
    expect(html).toContain('<table')
    expect(html).toContain('overflow-x:auto')
  })
})
