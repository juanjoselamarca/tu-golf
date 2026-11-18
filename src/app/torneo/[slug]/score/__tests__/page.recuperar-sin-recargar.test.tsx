import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, waitFor } from '@testing-library/react'

// Fable #833 v3 P2-1: el token de invitado estaba en las dependencias de la carga del scorer: recuperar el
// acceso recargaba toda la pantalla ("Cargando...") y con mala señal terminaba en "No pudimos cargar el torneo".

vi.mock('next/navigation', () => ({
  useParams: () => ({ slug: 'copa' }),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))
vi.mock('@/lib/supabase', () => ({ createClient: () => ({}) }))
vi.mock('@/lib/error-tracking', () => ({ captureError: vi.fn().mockResolvedValue(undefined) }))
const fetchScoringTournament = vi.fn()
vi.mock('@/lib/data/tournaments/scoring', () => ({
  fetchScoringTournament: (...a: unknown[]) => fetchScoringTournament(...a),
  fetchScoringRoster: async () => [],
  fetchScoringCourseContext: async () => ({ holes: [], tees: [] }),
}))
vi.mock('@/lib/data/tournaments/guest-player', () => ({ fetchMiJugadorInvitado: async () => null }))
const accesoRecuperado = vi.fn()
vi.mock('../hooks/useGuardadoTorneo', () => ({
  useGuardadoTorneo: () => ({
    currentScores: {}, savedHoles: new Set(), isOnline: true, saveStatus: 'idle', saveError: null, limpiarSaveError: () => {},
    sinAcceso: null, torneoInactivo: false, guardarHoyo: async () => {}, hoyosEnCola: () => 0, accesoRecuperado,
  }),
}))
let onToken: (t: string) => void = () => {}
vi.mock('../hooks/useRecuperarAccesoInvitado', () => ({
  useRecuperarAccesoInvitado: (a: { onToken: (t: string) => void }) => { onToken = a.onToken; return { estado: 'listo', mensaje: null, recuperar: async () => {} } },
}))

import PlayerScoringPage from '../page'

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('gp_guest_id', '22222222-2222-4222-8222-222222222222')
  localStorage.setItem('gp_guest_token', 'tok-viejo')
  fetchScoringTournament.mockReset().mockResolvedValue({ id: 't1', slug: 'copa', name: 'Copa', status: 'in_progress', total_rounds: 1, courses: null })
  accesoRecuperado.mockClear()
})

describe('scorer de torneo — recuperar el acceso de invitado', () => {
  it('el token recuperado llega al guardado SIN recargar la pantalla', async () => {
    render(<PlayerScoringPage />)
    await waitFor(() => expect(screen.queryByText('Cargando...')).toBeNull())
    expect(fetchScoringTournament).toHaveBeenCalledTimes(1)

    await act(async () => { onToken('tok-nuevo') })

    expect(accesoRecuperado).toHaveBeenCalledWith('tok-nuevo')
    expect(screen.queryByText('Cargando...')).toBeNull()
    await act(async () => { await new Promise(r => setTimeout(r, 20)) })
    expect(fetchScoringTournament).toHaveBeenCalledTimes(1)
  })
})
