// @vitest-environment jsdom
// Mi Golf › Identidad sigue DESIGN.md §4/§13 (16-nov-2026): DM Sans para texto y números, piso 13 px,
// etiquetas en oración. El 24-nov en prod las tarjetas de "Tu juego" ponían la etiqueta en DM Mono 9 px
// mayúsculas sobre el número en mono 26 px (y el nombre de la cancha favorita en mono), y la tarjeta del
// coach usaba degradado, comillas y cita en Playfair, y el CTA en blanco sobre dorado (2.65:1 en oscuro).
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { IdentidadTab } from '../IdentidadTab'
import { indiceVisible } from '@/golf/core/indice-visible'

const props = {
  userName: 'Ana',
  indice: indiceVisible({ indice: 15 }),
  nivel: null,
  totalRounds: 3,
  taigerSessionCount: 2,
  stats: {
    mejorScore: { gross: 36, vsPar: 0, hoyos: 9 },
    promedioUltimas5: { promedio: 41, hoyos: 9, serie: [40, 42, 41] },
    rondasJugadas: 10,
    canchaFavorita: { nombre: 'Prince of Wales', vecesJugada: 6 },
  },
  taigerLine: { source: 'fallback' as const, texto: 'Tu juego corto define la tarjeta.', cta_texto: 'Hablar con tAIger+ →', cta_href: '/coach' },
} as unknown as Parameters<typeof IdentidadTab>[0]

function violaciones(root: HTMLElement): string[] {
  const out: string[] = []
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    const st = el.style
    const id = `${el.tagName} «${el.textContent?.trim().slice(0, 24)}»`
    if (/dm-mono|playfair/.test(st.fontFamily)) out.push(`${id} fontFamily=${st.fontFamily}`)
    if (st.fontSize && parseFloat(st.fontSize) < 13) out.push(`${id} fontSize=${st.fontSize}`)
    if (st.textTransform === 'uppercase') out.push(`${id} uppercase`)
    if (st.fontStyle === 'italic') out.push(`${id} italic`)
    if (/gradient/.test(st.background)) out.push(`${id} gradient`)
    if (st.boxShadow) out.push(`${id} boxShadow`)
  }
  return out
}

describe('IdentidadTab — tipografía DESIGN.md §4/§13', () => {
  it('sin mono, serif, mayúsculas, itálica, degradados ni texto bajo 13 px', () => {
    const { container } = render(<IdentidadTab {...props} />)
    expect(violaciones(container)).toEqual([])
  })

  it('los valores numéricos de "Tu juego" son .num (DM Sans tabular); la cancha favorita es texto', () => {
    render(<IdentidadTab {...props} />)
    expect(screen.getByText('36').className).toContain('num')
    expect(screen.getByText('41.0').className).toContain('num')
    expect(screen.getByText('10').className).toContain('num')
    expect(screen.getByText('Prince of Wales').className).not.toContain('num')
  })

  it('el CTA del coach no pone texto blanco sobre el dorado', () => {
    render(<IdentidadTab {...props} />)
    const cta = screen.getByRole('link', { name: /Hablar con tAIger\+/ })
    expect(cta.style.color).toBe('var(--brand-dark)')
    expect(cta.style.background).toBe('var(--brand)')
  })
})
