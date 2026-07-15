/**
 * Historial — integración vista + hooks reales con supabase SANO mockeado.
 * Cubre el flujo completo: excluir muestra badge, eliminar quita la tarjeta,
 * borrado masivo detrás de confirmación. Regresión del reporte de botones.
 *
 * Post-RSC: page.tsx es Server Component (no renderizable con RTL) — se
 * testea HistorialView, el orquestador client, con la carga inicial por
 * props tal como se la pasa el server. Las MUTACIONES siguen usando los
 * hooks reales contra el mock de supabase.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/DefaultTeeBanner', () => ({ DefaultTeeBanner: () => null }))
vi.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showSuccess: vi.fn(), showError: vi.fn(), showWarning: vi.fn(), showInfo: vi.fn() }),
}))

const round = {
  id: 'r1', course_name: 'Los Leones', course_id: null, tee_color: null,
  played_at: '2026-06-01', scores: [4, 4, 4, 4, 4, 4, 4, 4, 4],
  total_gross: 36, holes_played: 9, notes: null, privacy: 'private',
  created_at: '2026-06-01', excluded_from_handicap: false,
}

// Resultados configurables del mock supabase (mutaciones + reload)
let loadData: { data: unknown; error: unknown } = { data: [round], error: null }
const delData = { data: [{ id: 'r1' }], error: null }
const updData = { data: [{ id: 'r1' }], error: null }

vi.mock('@/lib/supabase', () => ({
  createClient: () => {
    let op: 'delete' | 'update' | null = null
    const b: Record<string, unknown> = {}
    b.from = () => { op = null; return b }
    b.delete = () => { op = 'delete'; return b }
    b.update = () => { op = 'update'; return b }
    b.eq = () => b
    b.order = () => b
    b.limit = () => Promise.resolve(loadData)
    b.select = () => (op ? Promise.resolve(op === 'delete' ? delData : updData) : b)
    return {
      auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
      from: b.from,
      rpc: () => Promise.resolve({ error: null }),
    }
  },
}))

import { HistorialView } from '../components/HistorialView'

function renderHistorial(rounds = [round]) {
  return render(
    <HistorialView
      userId="u1"
      initialRounds={rounds}
      initialLoadError={false}
      stats={null}
      initialShowForm={false}
    />,
  )
}

beforeEach(() => { loadData = { data: [round], error: null } })

describe('Historial — flujo de botones', () => {
  it('Excluir del índice → aparece el badge "no cuenta para el índice"', async () => {
    const user = userEvent.setup()
    renderHistorial()
    await screen.findByLabelText('Opciones de la tarjeta')

    await user.click(screen.getByLabelText('Opciones de la tarjeta'))
    await user.click(screen.getByTestId('historial-menu-toggle-excluded'))

    await waitFor(() => expect(screen.getByText(/no cuenta para el índice/i)).toBeTruthy())
  })

  it('Eliminar → confirmar → la tarjeta desaparece', async () => {
    const user = userEvent.setup()
    renderHistorial()
    await screen.findByLabelText('Opciones de la tarjeta')

    await user.click(screen.getByLabelText('Opciones de la tarjeta'))
    await user.click(screen.getByTestId('historial-menu-eliminar'))
    await user.click(screen.getByTestId('historial-confirm-delete-confirm'))

    await waitFor(() => expect(document.getElementById('round-card-r1')).toBeNull())
  })

  it('Borrado masivo → checkbox habilita confirmar → se vacía la lista', async () => {
    const user = userEvent.setup()
    renderHistorial()
    await screen.findByTestId('historial-bulk-delete-open')

    await user.click(screen.getByTestId('historial-bulk-delete-open'))
    // El botón confirmar arranca deshabilitado hasta marcar el checkbox
    const confirm = screen.getByTestId('historial-bulk-delete-confirm') as HTMLButtonElement
    expect(confirm.disabled).toBe(true)

    await user.click(screen.getByTestId('historial-bulk-delete-understood'))
    expect(confirm.disabled).toBe(false)

    await user.click(confirm)
    await waitFor(() => expect(document.getElementById('round-card-r1')).toBeNull())
  })
})
