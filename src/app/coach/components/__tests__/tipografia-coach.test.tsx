/**
 * /coach — «Sesiones anteriores» y «Tu plan activo» siguen DESIGN.md §4 (QA Design 27-nov-2026):
 * números en DM Sans tabular (.num), nunca DM Mono; títulos en oración, sin mayúsculas espaciadas;
 * nada bajo el piso de 13 px.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { SesionesAnteriores } from '../SesionesAnteriores'
import { PlanActivo } from '../PlanActivo'
import type { CoachSession } from '@/lib/data/coach-home'
import type { ActivePlanSummary } from '@/golf/coach/intro'

vi.mock('next/link', () => ({
  default: ({ href, children, style }: { href: string; children: React.ReactNode; style?: React.CSSProperties }) => (
    <a href={href} style={style}>{children}</a>
  ),
}))

const sesion = {
  id: 's1', session_type: 'post_round', created_at: '2026-11-10T12:00:00Z', next_focus: 'Respirar antes del putt',
} as CoachSession

function tamanoPx(el: HTMLElement): number {
  return parseFloat(el.style.fontSize)
}

describe('SesionesAnteriores — tipografía', () => {
  it('el título es un h2 de sección (18 px, DM Sans, en oración), no un caption mono en mayúsculas', () => {
    render(<SesionesAnteriores sesiones={[sesion]} />)
    const h2 = screen.getByRole('heading', { level: 2, name: 'Sesiones anteriores' })
    expect(h2.style.fontFamily).not.toMatch(/mono/i)
    expect(h2.style.textTransform).not.toBe('uppercase')
    expect(h2.style.letterSpacing).toBe('')
    expect(tamanoPx(h2)).toBe(18)
  })

  it('el foco y la fecha no bajan del piso de 13 px; la fecha va en cifras tabulares', () => {
    render(<SesionesAnteriores sesiones={[sesion]} />)
    const foco = screen.getByText(/^Foco:/)
    expect(tamanoPx(foco)).toBeGreaterThanOrEqual(13)
    const fecha = screen.getByText(/nov/i)
    expect(tamanoPx(fecha)).toBeGreaterThanOrEqual(13)
    expect(fecha.className).toContain('num')
  })
})

describe('PlanActivo — el porcentaje de adherencia', () => {
  it('va en DM Sans tabular (.num), no en DM Mono', () => {
    const plan = {
      title: 'Respirar antes del putt', description: 'Dos respiraciones', status: 'active',
      dots: [], appliedPct: 75, total: 4,
    } as unknown as ActivePlanSummary
    render(<PlanActivo plan={plan} />)
    const pct = screen.getByText('75%')
    expect(pct.style.fontFamily).not.toMatch(/mono/i)
    expect(pct.className).toContain('num')
    expect(screen.getByText('4').className).toContain('num')
  })
})
