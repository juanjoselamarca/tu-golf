import { describe, it, expect, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

vi.mock('@/components/billing/ProGate', () => ({ ProGate: ({ children }: { children: ReactNode }) => <>{children}</> }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => '/torneo/copa/en-vivo' }))

import LiveView, { type LiveViewProps } from './LiveView'

const tournament = {
  id: 't1', slug: 'copa', name: 'Copa', format: 'stroke_play', formato_juego: 'stroke_play', modo_juego: 'gross',
  hole_count: 9, total_rounds: 1, status: 'in_progress', live: false, caminoRondaLibre: true,
} as unknown as LiveViewProps['tournament']

describe('/en-vivo — el pie WD/DQ desde el PRIMER render (#813)', () => {
  it('lo que trae el server component se ve sin esperar el polling', () => {
    render(
      <LiveView
        tournament={tournament}
        players={[]}
        categories={[]}
        groups={[{ id: 'g1', name: 'Grupo 1' }]}
        fuera={[{ id: 'j-ana', name: 'Ana', status: 'withdrawn', reason: 'Lesión', group_id: 'g1', score: { valor: -2, esPuntos: false, grossTotal: 46, hoyos: 12 } }]}
      />,
    )
    const pie = screen.getByRole('region', { name: 'No compiten por posición' })
    expect(within(pie).getByText('Ana')).toBeTruthy()
    expect(within(pie).getByText('Retirado')).toBeTruthy()
    expect(within(pie).getByText('-2')).toBeTruthy()
    expect(within(pie).getByText('46 golpes · 12 hoyos')).toBeTruthy()
  })
})
