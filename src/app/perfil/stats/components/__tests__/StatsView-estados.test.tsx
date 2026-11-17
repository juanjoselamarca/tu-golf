// /perfil/stats: una lectura fallida nunca se muestra como "aún no tienes rondas", y el GWI ya no existe.
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/components/billing/ProGate', () => ({ ProGate: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('next/dynamic', () => ({ default: () => () => null }))
const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

import { StatsView } from '../StatsView'
import { normalizarRondas } from '@/golf/stats/rondas-normalizadas'


describe('StatsView — estados', () => {
  it('lectura fallida (null): error con reintento, no el estado vacío', () => {
    const { container, getByRole } = render(<StatsView rondas={null} />)
    expect(container.textContent).toContain('No pudimos cargar tus estadísticas')
    expect(container.textContent).not.toContain('Aún no tienes rondas')
    getByRole('button', { name: /reintentar/i }).click()
    expect(refresh).toHaveBeenCalled()
  })

  it('sin rondas ([]): estado vacío', () => {
    const { container } = render(<StatsView rondas={[]} />)
    expect(container.textContent).toContain('Aún no tienes rondas')
  })

  it('con rondas: un solo gráfico "Tu score vs par" y sin GWI', () => {
    const rondas = normalizarRondas([80, 85, 90].map((g, i) => ({
      id: `r${i}`, course_name: 'Los Leones', course_id: null, played_at: `2026-03-0${i + 1}`,
      scores: Array(18).fill(5), total_gross: g, holes_played: 18, import_source: null, formato_juego: 'stroke_play',
    })), [], [])
    const { container } = render(<StatsView rondas={rondas} />)
    const t = container.textContent ?? ''
    expect(t).toContain('Tu score vs par')
    expect(t).not.toMatch(/GWI|Wellness|Evolución de score|Tendencia de scoring/)
    expect(t).toContain('Promedio vs par · 18 hoyos')
    expect(t).toContain('+13') // (8 + 13 + 18) / 3
    expect(t).toContain('Mejor ronda80 +8')
    expect(t).not.toMatch(/Federación|Golfers\+|Peor ronda/)
  })

  it('solo rondas "solo total": promedio y mejor ronda sí; birdies/eagles "—", nunca un 0 falso', () => {
    const rondas = normalizarRondas([85, 90].map((g, i) => ({
      id: `t${i}`, course_name: 'Los Leones', course_id: null, played_at: `2026-03-0${i + 1}`,
      scores: null, total_gross: g, holes_played: 18, import_source: 'manual', formato_juego: 'stroke_play',
    })), [], [])
    const { container } = render(<StatsView rondas={rondas} />)
    const t = container.textContent ?? ''
    expect(t).toContain('Mejor ronda85 +13')
    expect(t).toContain('Birdies—')
    expect(t).toContain('Eagles—')
    expect(t).not.toContain('Resultado por hoyo')
  })
})
