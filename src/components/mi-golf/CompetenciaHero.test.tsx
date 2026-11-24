// @vitest-environment jsdom
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { Acciones, HeroActiva, HeroProximo, HeroVacio } from './CompetenciaHero'
import type { RondaLibre } from '@/lib/mi-golf/types'
import type { PlayingTournament } from '@/lib/mi-golf/dashboard-derive'

afterEach(cleanup)

describe('Acciones del dashboard', () => {
  it('los links secundarios se subrayan pegados al texto, no con un borde que la altura de toque (44 px) separa', () => {
    render(<Acciones />)
    for (const name of ['Organizar torneo', 'Unirme con código']) {
      const link = screen.getByRole('link', { name })
      expect(link.style.borderBottom).toBe('')
      expect(link.style.textDecoration).toContain('underline')
      expect(link.style.alignItems).toBe('center')
    }
  })

  it('"Nueva ronda" usa el ícono de línea, no el carácter "+"', () => {
    render(<Acciones />)
    const link = screen.getByRole('link', { name: /Nueva ronda/ })
    expect(link.querySelector('svg')).not.toBeNull()
    expect(link.textContent?.trim()).toBe('Nueva ronda')
  })
})

// DESIGN.md §4 (16-nov-2026): una familia (DM Sans) para texto y números, piso de 13 px, oración y no
// mayúsculas espaciadas. El hero tenía etiquetas en DM Mono 10-11 px en mayúsculas y el número en Playfair.
function violacionesTipograficas(root: HTMLElement): string[] {
  const out: string[] = []
  for (const el of [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))]) {
    const st = el.style
    const id = `${el.tagName} «${el.textContent?.trim().slice(0, 24)}»`
    if (/dm-mono|playfair/.test(st.fontFamily)) out.push(`${id} fontFamily=${st.fontFamily}`)
    if (st.fontSize && parseFloat(st.fontSize) < 13) out.push(`${id} fontSize=${st.fontSize}`)
    if (st.textTransform === 'uppercase') out.push(`${id} uppercase`)
    if (st.animation) out.push(`${id} animation=${st.animation}`)
  }
  return out
}

describe('Hero del dashboard — tipografía DESIGN.md §4', () => {
  const ronda = { codigo: 'ABC123', course_name: 'Club de Golf Los Leones' } as unknown as RondaLibre
  const summary = { siguienteHoyo: 7, jugados: 6, totalHoyos: 18, scoreParcial: 3 } as unknown as Parameters<typeof HeroActiva>[0]['summary']
  const torneo = {
    slug: 'copa', name: 'Copa Primavera', estado: 'proximo', diasRestantes: 3,
    horaSalida: '08:30', courses: { nombre: 'La Dehesa' },
  } as unknown as PlayingTournament

  it('ronda en vivo: sin mono, serif, mayúsculas, pulsos ni texto bajo 13 px; el score es .num', () => {
    const { container } = render(<HeroActiva ronda={ronda} summary={summary} />)
    expect(violacionesTipograficas(container)).toEqual([])
    expect(screen.getByText('+3').className).toContain('num')
    expect(screen.getByText('En vivo')).toBeTruthy()
  })

  it('próximo torneo: sin mono, serif ni mayúsculas; la cuenta regresiva es .num', () => {
    const { container } = render(<HeroProximo torneo={torneo} />)
    expect(violacionesTipograficas(container)).toEqual([])
    expect(screen.getByText('3d').className).toContain('num')
  })

  it('vacío y acciones: nada bajo 13 px', () => {
    const { container } = render(<><HeroVacio /><Acciones /></>)
    expect(violacionesTipograficas(container)).toEqual([])
  })
})
